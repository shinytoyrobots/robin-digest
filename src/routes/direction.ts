import express from "express";
import { getDb, getSetting } from "../db.js";
import { generateDailyDirection } from "../direction/generator.js";
import { createPauseRouter } from "../ui/shared.js";
import { renderDirectionPage, renderHistorySection, type DirectionRow, type TokenAvg } from "../ui/direction.html.js";
import type { StoredSong } from "../direction/spotify.js";

export const directionRouter = express.Router();

directionRouter.get("/dailydirection", (req, res) => {
  const notice = req.query.status as string | undefined;
  const dirPausedUntil = getSetting("direction_paused_until");
  const db = getDb();

  const direction = db.prepare(
    `SELECT id, focus_angle, suggestions, created_at FROM daily_directions
     WHERE created_at > datetime('now', '-1 day')
     ORDER BY created_at DESC LIMIT 1`
  ).get() as DirectionRow | undefined;

  const feedbackMap = new Map<number, string>();
  if (direction) {
    const rows = db.prepare(
      "SELECT suggestion_index, reaction FROM direction_feedback WHERE direction_id = ?"
    ).all(direction.id) as { suggestion_index: number; reaction: string }[];
    for (const r of rows) {
      feedbackMap.set(r.suggestion_index, r.reaction);
    }
  }

  const pastDirections = db.prepare(
    `SELECT id, focus_angle, suggestions, created_at FROM daily_directions
     WHERE created_at <= datetime('now', '-1 day') AND created_at > datetime('now', '-2 days')
     ORDER BY created_at DESC LIMIT 1`
  ).all() as DirectionRow[];

  const feedbackByDirection = new Map<number, Map<number, string>>();
  if (pastDirections.length > 0) {
    const ids = pastDirections.map((d) => d.id);
    const placeholders = ids.map(() => "?").join(",");
    const fbRows = db.prepare(
      `SELECT direction_id, suggestion_index, reaction FROM direction_feedback WHERE direction_id IN (${placeholders})`
    ).all(...ids) as { direction_id: number; suggestion_index: number; reaction: string }[];
    for (const r of fbRows) {
      if (!feedbackByDirection.has(r.direction_id)) {
        feedbackByDirection.set(r.direction_id, new Map());
      }
      feedbackByDirection.get(r.direction_id)!.set(r.suggestion_index, r.reaction);
    }
  }

  // Per-million-token pricing for models we use
  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "claude-haiku-4-5-20251001": { input: 0.80, output: 4.0 },
  };

  // Combine direction + song token usage for cost calculation
  const directionRows = db.prepare(
    `SELECT input_tokens, output_tokens, model_used FROM daily_directions
     WHERE input_tokens IS NOT NULL AND created_at > datetime('now', '-30 days')`
  ).all() as { input_tokens: number; output_tokens: number; model_used: string | null }[];

  const songRows = db.prepare(
    `SELECT input_tokens, output_tokens, model_used FROM direction_songs
     WHERE input_tokens IS NOT NULL AND created_at > datetime('now', '-30 days')`
  ).all() as { input_tokens: number; output_tokens: number; model_used: string | null }[];

  const allRows = [...directionRows, ...songRows];

  let avgTokens: TokenAvg | null = null;
  if (allRows.length > 0) {
    let totalIn = 0, totalOut = 0, totalCostUsd = 0;
    for (const row of allRows) {
      totalIn += row.input_tokens;
      totalOut += row.output_tokens;
      const pricing = MODEL_PRICING[row.model_used ?? ""] ?? MODEL_PRICING["claude-sonnet-4-6"];
      totalCostUsd += (row.input_tokens * pricing.input + row.output_tokens * pricing.output) / 1_000_000;
    }
    // Average per direction run (not per row — songs are part of a direction run)
    const runCount = directionRows.length || 1;
    avgTokens = {
      avgIn: Math.round(totalIn / runCount),
      avgOut: Math.round(totalOut / runCount),
      avgCostUsd: totalCostUsd / runCount,
      n: runCount,
    };
  }

  // Fetch song for today's direction
  let song: StoredSong | null = null;
  if (direction) {
    song = db.prepare(
      "SELECT * FROM direction_songs WHERE direction_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(direction.id) as StoredSong | null ?? null;
  }

  const historyHtml = renderHistorySection(pastDirections, feedbackByDirection);
  res.type("html").send(renderDirectionPage(direction ?? null, feedbackMap, historyHtml, notice, dirPausedUntil, avgTokens, song));
});

directionRouter.get("/dailydirection/latest-timestamp", (_req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT created_at FROM daily_directions ORDER BY created_at DESC LIMIT 1").get() as { created_at: string } | undefined;
  res.json({ created_at: row?.created_at ?? null });
});

directionRouter.post("/dailydirection/feedback", express.json(), (req, res) => {
  const { direction_id, suggestion_index, reaction, note } = req.body as {
    direction_id: number; suggestion_index: number; reaction: string; note?: string;
  };

  const validReactions = ["useful", "not_relevant", "done", "inspired"];
  if (!direction_id || suggestion_index === undefined || !validReactions.includes(reaction)) {
    res.status(400).json({ error: "Invalid feedback data" });
    return;
  }

  const db = getDb();
  db.prepare(
    "INSERT INTO direction_feedback (direction_id, suggestion_index, reaction, note) VALUES (?, ?, ?, ?)"
  ).run(direction_id, suggestion_index, reaction, note ?? null);

  res.json({ ok: true });
});


directionRouter.post("/dailydirection/refresh", express.urlencoded({ extended: false }), (req, res) => {
  const ALLOWED_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
  const requestedModel = req.body?.model as string | undefined;
  const model = ALLOWED_MODELS.includes(requestedModel ?? "") ? requestedModel : undefined;
  console.error(`[direction] Manual refresh triggered (model: ${model ?? "default"})`);

  const db = getDb();
  // Find the current direction's song before regenerating, so we can carry it forward
  const currentDirection = db.prepare(
    `SELECT id FROM daily_directions
     WHERE created_at > datetime('now', '-1 day')
     ORDER BY created_at DESC LIMIT 1`
  ).get() as { id: number } | undefined;

  const existingSong = currentDirection
    ? db.prepare(
        "SELECT id FROM direction_songs WHERE direction_id = ? ORDER BY created_at DESC LIMIT 1"
      ).get(currentDirection.id) as { id: number } | undefined
    : undefined;

  generateDailyDirection(model).then(newId => {
    // Re-link the existing song to the new direction
    if (existingSong) {
      db.prepare("UPDATE direction_songs SET direction_id = ? WHERE id = ?")
        .run(newId, existingSong.id);
      console.error(`[direction] Carried forward song #${existingSong.id} to direction #${newId}`);
    }
  }).catch(err => console.error("[direction] Refresh error:", err));

  res.redirect("/dailydirection?status=generating");
});

directionRouter.use(createPauseRouter("direction_paused_until", "/dailydirection"));
