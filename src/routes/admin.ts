import express from "express";
import { getDb } from "../db.js";
import { runPipeline, runAllPipelines } from "../pipeline/runner.js";
import { generateDailyDirection } from "../direction/generator.js";
import { generateSongRecommendation, type AttemptLog } from "../direction/spotify.js";
import { renderSourcesPage } from "../ui/sources.html.js";
import { discoverFeedForUrl } from "../pipeline/feed-finder.js";
import { parseFeed } from "../lib/rss.js";
import { stripHtml } from "../lib/html.js";
import { generateText } from "../lib/claude.js";

export const adminRouter = express.Router();
export const sourcesPageRouter = express.Router();

const SOURCE_LIMIT = 20;

type DeletedSourceRecord = {
  id: number; pipeline_id: string; pipeline_name: string;
  name: string; url: string; feed_url: string | null; feed_type: string | null;
  auto_deleted: number; deleted_at: string;
};

function softDeleteSource(
  db: ReturnType<typeof getDb>,
  source: { id: number; pipeline_id: string; pipeline_name: string; name: string; url: string; feed_url: string | null; feed_type: string | null },
  autoDeleted: boolean
): void {
  db.transaction(() => {
    db.prepare(
      "INSERT INTO deleted_sources (pipeline_id, pipeline_name, name, url, feed_url, feed_type, auto_deleted) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(source.pipeline_id, source.pipeline_name, source.name, source.url, source.feed_url, source.feed_type, autoDeleted ? 1 : 0);
    db.prepare("UPDATE snippets SET source_article_id = NULL WHERE source_article_id IN (SELECT id FROM articles WHERE source_id = ?)").run(source.id);
    db.prepare("DELETE FROM sources WHERE id = ?").run(source.id);
  })();
}

export function autoDeleteStaleSources(): number {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const stale = db.prepare(`
    SELECT * FROM (
      SELECT s.id, s.pipeline_id, p.name as pipeline_name, s.name, s.url, s.feed_url, s.feed_type,
        (SELECT MAX(COALESCE(a.published_at, a.fetched_at)) FROM articles a WHERE a.source_id = s.id) as latest_article_at
      FROM sources s
      JOIN pipelines p ON s.pipeline_id = p.id
      WHERE s.last_fetched_at IS NOT NULL
    ) WHERE latest_article_at IS NULL OR latest_article_at < ?
  `).all(thirtyDaysAgo) as (DeletedSourceRecord & { latest_article_at: string | null })[];
  for (const source of stale) {
    softDeleteSource(db, source, true);
  }
  return stale.length;
}

export function purgeOldDeletedSources(): number {
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare("DELETE FROM deleted_sources WHERE deleted_at < ?").run(sevenDaysAgo);
  return result.changes as number;
}

adminRouter.get("/admin/sources", (_req, res) => {
  const db = getDb();
  const sources = db.prepare("SELECT pipeline_id, name, url, feed_url, feed_type, enabled, last_fetched_at FROM sources ORDER BY pipeline_id, url").all();
  res.json(sources);
});

adminRouter.get("/admin/stats", (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      s.pipeline_id,
      s.name,
      s.url,
      s.feed_url,
      s.enabled,
      s.last_fetched_at,
      COUNT(a.id) AS total_articles,
      SUM(CASE WHEN a.id IN (SELECT source_article_id FROM snippets WHERE source_article_id IS NOT NULL) THEN 1 ELSE 0 END) AS featured_articles,
      COUNT(a.id) - SUM(CASE WHEN a.id IN (SELECT source_article_id FROM snippets WHERE source_article_id IS NOT NULL) THEN 1 ELSE 0 END) AS available_articles
    FROM sources s
    LEFT JOIN articles a ON a.source_id = s.id
    GROUP BY s.id
    ORDER BY s.pipeline_id, s.name
  `).all();
  res.json(rows);
});

sourcesPageRouter.get("/sources", (req, res) => {
  const db = getDb();
  const sources = db.prepare(
    "SELECT s.pipeline_id, p.name as pipeline_name, s.name, s.url, s.enabled, s.last_fetched_at, " +
    "(SELECT MAX(COALESCE(a.published_at, a.fetched_at)) FROM articles a WHERE a.source_id = s.id) as latest_article_at " +
    "FROM sources s JOIN pipelines p ON s.pipeline_id = p.id " +
    "ORDER BY p.name, s.enabled DESC, s.name"
  ).all() as { pipeline_id: string; pipeline_name: string; name: string; url: string; enabled: number; last_fetched_at: string | null; latest_article_at: string | null }[];
  const pipelines = db.prepare("SELECT id, name FROM pipelines WHERE enabled = 1 ORDER BY name").all() as { id: string; name: string }[];
  const deleted = db.prepare(
    "SELECT id, pipeline_id, pipeline_name, name, url, auto_deleted, deleted_at FROM deleted_sources ORDER BY deleted_at DESC"
  ).all() as DeletedSourceRecord[];
  const token = (req.query.token as string | undefined) || "";
  res.type("html").send(renderSourcesPage(sources, pipelines, deleted, token));
});

adminRouter.post("/admin/update-source", express.json(), (req, res) => {
  const { pipeline_id, url, new_url, feed_url, name, enabled } = req.body as {
    pipeline_id: string; url: string;
    new_url?: string; feed_url?: string; name?: string; enabled?: boolean;
  };
  if (!pipeline_id || !url) { res.status(400).json({ error: "pipeline_id and url required" }); return; }
  const db = getDb();
  const source = db.prepare("SELECT id FROM sources WHERE pipeline_id = ? AND url = ?").get(pipeline_id, url) as { id: number } | undefined;
  if (!source) { res.status(404).json({ error: "source not found" }); return; }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (new_url !== undefined) { sets.push("url = ?"); params.push(new_url); }
  if (feed_url !== undefined) { sets.push("feed_url = ?"); params.push(feed_url); }
  if (name !== undefined) { sets.push("name = ?"); params.push(name); }
  if (enabled !== undefined) { sets.push("enabled = ?"); params.push(enabled ? 1 : 0); }
  if (sets.length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  params.push(source.id);
  db.prepare(`UPDATE sources SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  res.json({ updated: 1, pipeline_id, url: new_url ?? url });
});

sourcesPageRouter.post("/admin/seed-sources", express.json(), (req, res) => {
  const { pipeline_id, sources } = req.body as {
    pipeline_id: string;
    sources: { name: string; url: string; feed_url?: string; feed_type?: string }[];
  };
  if (!pipeline_id || !sources?.length) {
    res.status(400).json({ error: "pipeline_id and sources[] required" });
    return;
  }
  const db = getDb();

  // Enforce 20-source cap — only count truly new sources
  const existingUrls = new Set(
    (db.prepare("SELECT url FROM sources WHERE pipeline_id = ?").all(pipeline_id) as { url: string }[]).map(s => s.url)
  );
  const newSources = sources.filter(s => !existingUrls.has(s.url));
  const currentCount = existingUrls.size;
  if (currentCount + newSources.length > SOURCE_LIMIT) {
    res.status(400).json({
      error: `Adding ${newSources.length} source(s) would exceed the ${SOURCE_LIMIT}-source limit for pipeline '${pipeline_id}' (currently ${currentCount})`,
    });
    return;
  }

  const insert = db.prepare("INSERT OR IGNORE INTO sources (pipeline_id, name, url, feed_url, feed_type) VALUES (?, ?, ?, ?, ?)");
  const tx = db.transaction(() => {
    for (const s of sources) insert.run(pipeline_id, s.name, s.url, s.feed_url ?? null, s.feed_type ?? null);
  });
  tx();
  const count = (db.prepare("SELECT COUNT(*) as c FROM sources WHERE pipeline_id = ?").get(pipeline_id) as { c: number }).c;
  res.json({ pipeline_id, total_sources: count });
});

sourcesPageRouter.delete("/admin/delete-source", express.json(), (req, res) => {
  const { pipeline_id, url } = req.body as { pipeline_id: string; url: string };
  if (!pipeline_id || !url) {
    res.status(400).json({ error: "pipeline_id and url required" });
    return;
  }
  try {
    const db = getDb();
    const source = db.prepare(
      "SELECT s.id, s.name, s.feed_url, s.feed_type, p.name as pipeline_name FROM sources s JOIN pipelines p ON s.pipeline_id = p.id WHERE s.pipeline_id = ? AND s.url = ?"
    ).get(pipeline_id, url) as { id: number; name: string; feed_url: string | null; feed_type: string | null; pipeline_name: string } | undefined;
    if (!source) {
      res.json({ pipeline_id, url, deleted: 0 });
      return;
    }
    softDeleteSource(db, { ...source, pipeline_id, url }, false);
    res.json({ pipeline_id, url, deleted: 1 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

sourcesPageRouter.post("/admin/reactivate-source", express.json(), (req, res) => {
  const { id } = req.body as { id: number };
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  const db = getDb();
  const deleted = db.prepare("SELECT * FROM deleted_sources WHERE id = ?").get(id) as DeletedSourceRecord | undefined;
  if (!deleted) { res.status(404).json({ error: "deleted source not found" }); return; }
  try {
    db.transaction(() => {
      db.prepare(
        "INSERT OR IGNORE INTO sources (pipeline_id, name, url, feed_url, feed_type) VALUES (?, ?, ?, ?, ?)"
      ).run(deleted.pipeline_id, deleted.name, deleted.url, deleted.feed_url, deleted.feed_type);
      db.prepare("DELETE FROM deleted_sources WHERE id = ?").run(id);
    })();
    res.json({ reactivated: 1, pipeline_id: deleted.pipeline_id, url: deleted.url });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

sourcesPageRouter.post("/admin/suggest-source", express.json(), async (req, res) => {
  const { url } = req.body as { url: string };
  if (!url) { res.status(400).json({ error: "url required" }); return; }

  try {
    const feedInfo = await discoverFeedForUrl(url);
    if (!feedInfo) {
      res.status(400).json({ error: "No RSS/Atom feed found. This URL cannot be added as a source." });
      return;
    }

    // Fetch and parse feed for article samples
    let articles: { title: string; content: string }[] = [];
    try {
      const feedRes = await fetch(feedInfo.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
        signal: AbortSignal.timeout(10000),
      });
      if (feedRes.ok) {
        const xml = await feedRes.text();
        articles = parseFeed(xml, feedInfo.type).slice(0, 5).map(a => ({
          title: a.title,
          content: stripHtml(a.content || "").slice(0, 500),
        }));
      }
    } catch { /* proceed with no articles */ }

    const db = getDb();
    const pipelines = db.prepare("SELECT id, name FROM pipelines WHERE enabled = 1 ORDER BY name").all() as { id: string; name: string }[];
    const pipelineList = pipelines.map(p => `- ${p.id}: ${p.name}`).join("\n");
    const sampleText = articles.length > 0
      ? articles.map((a, i) => `${i + 1}. ${a.title}\n${a.content}`).join("\n\n")
      : "(No recent articles found)";

    const prompt = `Categorize this content source for a personal digest feed reader.
URL: ${url}
Feed: ${feedInfo.url}
Recent articles:
${sampleText}

Available pipelines (id: name):
${pipelineList}

Return JSON only (no markdown):
{"pipeline_id":"<best match id>","name":"<short clean name, no Blog suffix unless meaningful>","rationale":"<one sentence why>"}`;

    const raw = await generateText(prompt, undefined, { temperature: 0.2, maxTokens: 256 });
    let parsed: { pipeline_id: string; name: string; rationale: string };
    try {
      const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      res.status(500).json({ error: "Failed to parse AI response", raw });
      return;
    }

    res.json({ ...parsed, url, feed_url: feedInfo.url, feed_type: feedInfo.type });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

adminRouter.get("/admin/curator-preview", (_req, res) => {
  const db = getDb();
  const pipelines = db.prepare("SELECT id, name FROM pipelines WHERE enabled = 1 ORDER BY name").all() as { id: string; name: string }[];

  const result: Record<string, { pipeline: string; article_count: number; articles: unknown[] }> = {};
  for (const p of pipelines) {
    const articles = db.prepare(`
      WITH latest_per_source AS (
        SELECT a.id,
               ROW_NUMBER() OVER (PARTITION BY a.source_id ORDER BY COALESCE(a.published_at, a.fetched_at) DESC) AS rn
        FROM articles a
        JOIN sources s ON a.source_id = s.id
        WHERE s.pipeline_id = ?
          AND a.id NOT IN (SELECT source_article_id FROM snippets WHERE source_article_id IS NOT NULL)
      )
      SELECT a.id, a.title, a.published_at, a.fetched_at, s.name as source_name
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      JOIN latest_per_source lps ON a.id = lps.id AND lps.rn = 1
      ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
      LIMIT 25
    `).all(p.id);
    result[p.id] = { pipeline: p.name, article_count: articles.length, articles };
  }
  res.json(result);
});

adminRouter.post("/admin/run-pipeline", express.json(), (req, res) => {
  const pipelineId = req.body?.pipeline_id as string | undefined;
  if (pipelineId) {
    console.error(`[admin] Manual run: ${pipelineId}`);
    res.status(202).json({ status: "accepted", pipeline_id: pipelineId });
    runPipeline(pipelineId).then(result => {
      console.error(`[admin] Completed ${pipelineId}: ${result.snippets_created} snippets, ${result.errors.length} errors`);
    }).catch(err => {
      console.error(`[admin] Pipeline error (${pipelineId}):`, err);
    });
  } else {
    console.error(`[admin] Manual run: all pipelines`);
    res.status(202).json({ status: "accepted", pipeline_id: "all" });
    runAllPipelines().then(results => {
      console.error(`[admin] Completed all pipelines: ${results.length} ran`);
    }).catch(err => {
      console.error(`[admin] Pipeline error (all):`, err);
    });
  }
});

adminRouter.post("/admin/clear-writing-cache", (_req, res) => {
  const db = getDb();
  const result = db.prepare("DELETE FROM writing_cache").run();
  console.error(`[admin] Writing cache cleared (${result.changes} entries)`);
  res.json({ cleared: result.changes });
});

adminRouter.post("/admin/run-stale-cleanup", (_req, res) => {
  try {
    const deleted = autoDeleteStaleSources();
    const purged = purgeOldDeletedSources();
    console.error(`[admin] Stale cleanup: ${deleted} auto-deleted, ${purged} purged`);
    res.json({ deleted, purged });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

adminRouter.post("/admin/run-direction", express.json(), (_req, res) => {
  console.error("[admin] Manual direction generation");
  res.status(202).json({ status: "accepted" });
  generateDailyDirection().then(id => {
    console.error(`[admin] Daily direction generated: #${id}`);
  }).catch(err => {
    console.error("[admin] Direction generation error:", err);
  });
});

adminRouter.post("/admin/run-song", express.json(), async (req, res) => {
  const db = getDb();
  const directionId = req.body?.direction_id as number | undefined;

  const id = directionId
    ?? (db.prepare("SELECT id FROM daily_directions ORDER BY created_at DESC LIMIT 1").get() as { id: number } | undefined)?.id;

  if (!id) {
    res.status(404).json({ error: "No directions found" });
    return;
  }

  console.error(`[admin] Manual song generation for direction #${id}`);
  try {
    const attempts: AttemptLog[] = [];
    const song = await generateSongRecommendation(id, attempts);
    if (song) {
      res.json({ status: "ok", song, attempts });
    } else {
      res.json({ status: "no_song", message: "No suitable recent track found after 3 attempts", attempts });
    }
  } catch (err) {
    console.error("[admin] Song generation error:", err);
    res.status(500).json({ error: String(err) });
  }
});
