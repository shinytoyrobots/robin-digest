import express from "express";
import { getDb, getSetting, setSetting } from "../db.js";
import { generateDailyDirection } from "../direction/generator.js";
import { getTodayIso } from "../ui/shared.js";
import { renderDirectionPage, renderHistorySection, type DirectionRow } from "../ui/direction.html.js";

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

  const historyHtml = renderHistorySection(pastDirections, feedbackByDirection);
  res.type("html").send(renderDirectionPage(direction ?? null, feedbackMap, historyHtml, notice, dirPausedUntil));
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

directionRouter.post("/dailydirection/refresh", (_req, res) => {
  console.error("[direction] Manual refresh triggered");
  generateDailyDirection().catch(err => console.error("[direction] Refresh error:", err));
  res.redirect("/dailydirection?status=generating");
});

directionRouter.post("/dailydirection/pause", express.urlencoded({ extended: false }), (req, res) => {
  const until = req.body.until as string;
  if (!until || until < getTodayIso()) { res.redirect("/dailydirection"); return; }
  setSetting("direction_paused_until", until);
  console.error(`[direction] Paused until ${until}`);
  res.redirect("/dailydirection");
});

directionRouter.post("/dailydirection/resume", (_req, res) => {
  setSetting("direction_paused_until", null);
  console.error("[direction] Resumed");
  res.redirect("/dailydirection");
});
