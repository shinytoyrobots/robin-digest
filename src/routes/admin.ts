import express from "express";
import { getDb } from "../db.js";
import { runPipeline, runAllPipelines } from "../pipeline/runner.js";
import { generateDailyDirection } from "../direction/generator.js";

export const adminRouter = express.Router();

adminRouter.get("/admin/sources", (_req, res) => {
  const db = getDb();
  const sources = db.prepare("SELECT pipeline_id, name, url, enabled FROM sources ORDER BY pipeline_id, url").all();
  res.json(sources);
});

adminRouter.post("/admin/seed-sources", express.json(), (req, res) => {
  const { pipeline_id, sources } = req.body as { pipeline_id: string; sources: { name: string; url: string }[] };
  if (!pipeline_id || !sources?.length) {
    res.status(400).json({ error: "pipeline_id and sources[] required" });
    return;
  }
  const db = getDb();
  const insert = db.prepare("INSERT OR IGNORE INTO sources (pipeline_id, name, url) VALUES (?, ?, ?)");
  const tx = db.transaction(() => { for (const s of sources) insert.run(pipeline_id, s.name, s.url); });
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
