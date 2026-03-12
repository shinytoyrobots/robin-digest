import express from "express";
import { getDb } from "../db.js";
import { runPipeline, runAllPipelines } from "../pipeline/runner.js";
import { generateDailyDirection } from "../direction/generator.js";
import { renderSourcesPage } from "../ui/sources.html.js";
import { discoverFeedForUrl } from "../pipeline/feed-finder.js";
import { parseFeed } from "../lib/rss.js";
import { stripHtml } from "../lib/html.js";
import { generateText } from "../lib/claude.js";

export const adminRouter = express.Router();

const SOURCE_LIMIT = 20;

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

adminRouter.get("/sources", (req, res) => {
  const db = getDb();
  const sources = db.prepare(
    "SELECT s.pipeline_id, p.name as pipeline_name, s.name, s.url, s.enabled " +
    "FROM sources s JOIN pipelines p ON s.pipeline_id = p.id " +
    "ORDER BY p.name, s.enabled DESC, s.name"
  ).all() as { pipeline_id: string; pipeline_name: string; name: string; url: string; enabled: number }[];
  const pipelines = db.prepare("SELECT id, name FROM pipelines WHERE enabled = 1 ORDER BY name").all() as { id: string; name: string }[];
  const token = (req.query.token as string | undefined) || "";
  res.type("html").send(renderSourcesPage(sources, pipelines, token));
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

adminRouter.post("/admin/seed-sources", express.json(), (req, res) => {
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

adminRouter.delete("/admin/delete-source", express.json(), (req, res) => {
  const { pipeline_id, url } = req.body as { pipeline_id: string; url: string };
  if (!pipeline_id || !url) {
    res.status(400).json({ error: "pipeline_id and url required" });
    return;
  }
  try {
    const db = getDb();
    const source = db.prepare("SELECT id FROM sources WHERE pipeline_id = ? AND url = ?").get(pipeline_id, url) as { id: number } | undefined;
    if (!source) {
      res.json({ pipeline_id, url, deleted: 0 });
      return;
    }
    db.transaction(() => {
      db.prepare("UPDATE snippets SET source_article_id = NULL WHERE source_article_id IN (SELECT id FROM articles WHERE source_id = ?)").run(source.id);
      db.prepare("DELETE FROM sources WHERE id = ?").run(source.id);
    })();
    res.json({ pipeline_id, url, deleted: 1 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

adminRouter.post("/admin/suggest-source", express.json(), async (req, res) => {
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

adminRouter.post("/admin/run-direction", express.json(), (_req, res) => {
  console.error("[admin] Manual direction generation");
  res.status(202).json({ status: "accepted" });
  generateDailyDirection().then(id => {
    console.error(`[admin] Daily direction generated: #${id}`);
  }).catch(err => {
    console.error("[admin] Direction generation error:", err);
  });
});
