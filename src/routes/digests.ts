import express from "express";
import { getDb, getSetting } from "../db.js";
import { runAllPipelines } from "../pipeline/runner.js";
import { isFeaturePaused, createPauseRouter } from "../ui/shared.js";
import { renderDigestsPage } from "../ui/digests.html.js";

export const digestsRouter = express.Router();

type DigestRow = { id: number; pipeline_id: string; title: string; created_at: string; pipeline_name: string };
type SnippetRow = { key_insight: string; source_name: string; source_url: string; is_fresh: number };

digestsRouter.get("/digests", (req, res) => {
  const notice = req.query.status as string | undefined;
  const digestPausedUntil = getSetting("digest_paused_until");
  const digestPaused = isFeaturePaused("digest_paused_until");
  const db = getDb();

  const todayDigests = db.prepare(
    "SELECT d.*, p.name as pipeline_name FROM digests d " +
    "JOIN pipelines p ON d.pipeline_id = p.id " +
    "WHERE d.created_at > datetime('now', '-1 day') " +
    "AND d.id = (SELECT id FROM digests d2 WHERE d2.pipeline_id = d.pipeline_id AND d2.created_at > datetime('now', '-1 day') ORDER BY d2.created_at DESC LIMIT 1) " +
    "ORDER BY d.created_at DESC"
  ).all() as DigestRow[];

  const yesterdayDigests = db.prepare(
    "SELECT d.*, p.name as pipeline_name FROM digests d " +
    "JOIN pipelines p ON d.pipeline_id = p.id " +
    "WHERE d.created_at <= datetime('now', '-1 day') AND d.created_at > datetime('now', '-2 days') " +
    "AND d.id = (SELECT id FROM digests d2 WHERE d2.pipeline_id = d.pipeline_id AND d2.created_at <= datetime('now', '-1 day') AND d2.created_at > datetime('now', '-2 days') ORDER BY d2.created_at DESC LIMIT 1) " +
    "ORDER BY d.created_at DESC"
  ).all() as DigestRow[];

  const allDigests = [...todayDigests, ...yesterdayDigests];
  const snippetsByDigest = new Map<number, SnippetRow[]>();
  if (allDigests.length > 0) {
    const ids = allDigests.map(d => d.id);
    const placeholders = ids.map(() => "?").join(",");
    const allSnippets = db.prepare(
      `SELECT digest_id, key_insight, source_name, source_url, is_fresh FROM snippets WHERE digest_id IN (${placeholders}) ORDER BY digest_id, position`
    ).all(...ids) as (SnippetRow & { digest_id: number })[];
    for (const s of allSnippets) {
      if (!snippetsByDigest.has(s.digest_id)) snippetsByDigest.set(s.digest_id, []);
      snippetsByDigest.get(s.digest_id)!.push(s);
    }
  }

  res.type("html").send(renderDigestsPage(
    todayDigests, yesterdayDigests, snippetsByDigest,
    digestPaused, digestPausedUntil, notice
  ));
});

digestsRouter.get("/digests/latest-timestamp", (_req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT created_at FROM digests ORDER BY created_at DESC LIMIT 1").get() as { created_at: string } | undefined;
  res.json({ created_at: row?.created_at ?? null });
});

digestsRouter.post("/digests/refresh", (_req, res) => {
  console.error("[digest] Manual refresh triggered");
  runAllPipelines().catch(err => console.error("[digest] Refresh error:", err));
  res.redirect("/digests?status=refresh_queued");
});

digestsRouter.use(createPauseRouter("digest_paused_until", "/digests"));
