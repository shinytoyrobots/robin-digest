import express from "express";
import crypto from "crypto";
import cron from "node-cron";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config, loadPipelineConfigs } from "./config.js";
import { getDb, upsertPipelines } from "./db.js";
import { createServer } from "./server.js";
import { runPipeline, runAllPipelines } from "./pipeline/runner.js";

// Initialize database and load pipeline configs
getDb();
const pipelineConfigs = loadPipelineConfigs();
upsertPipelines(pipelineConfigs);
console.error(`[init] Loaded ${pipelineConfigs.length} pipeline configs`);

const app = express();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  const d = new Date(iso + "Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!config.authToken) { next(); return; }
  const bearer = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;
  if (bearer === `Bearer ${config.authToken}` || queryToken === config.authToken) { next(); return; }
  res.status(401).json({ error: "Unauthorized" });
}

// --- Landing page ---

app.get("/", (_req, res) => {
  res.type("html").send(
    "<!DOCTYPE html><html><head><title>Robin Digest</title></head>" +
    "<body><h1>Robin Digest</h1>" +
    "<p>Content curation pipeline. <a href=\"/digests\">View digests</a></p>" +
    "</body></html>"
  );
});

// --- Public digests page ---

app.get("/digests", (_req, res) => {
  const db = getDb();
  const digests = db.prepare(
    "SELECT d.*, p.name as pipeline_name FROM digests d " +
    "JOIN pipelines p ON d.pipeline_id = p.id " +
    "WHERE d.created_at > datetime('now', '-7 days') " +
    "ORDER BY d.created_at DESC"
  ).all() as { id: number; pipeline_id: string; title: string; created_at: string; pipeline_name: string }[];

  let body = "";
  if (digests.length === 0) {
    body = "<p>No digests this week yet.</p>";
  } else {
    for (const digest of digests) {
      const snippets = db.prepare(
        "SELECT key_insight, source_name, source_url FROM snippets WHERE digest_id = ? ORDER BY position"
      ).all(digest.id) as { key_insight: string; source_name: string; source_url: string }[];

      body += "<section>";
      body += "<h2>" + esc(digest.title) + "</h2>";
      body += "<p class=\"meta\">" + esc(digest.pipeline_name) + " &middot; " + formatDate(digest.created_at) + "</p>";
      body += "<ul>";
      for (const s of snippets) {
        body += "<li>" + esc(s.key_insight) + " <span class=\"source\">&mdash; <a href=\"" + esc(s.source_url) + "\">" + esc(s.source_name) + "</a></span></li>";
      }
      body += "</ul></section>";
    }
  }

  const html = "<!DOCTYPE html><html><head><title>This Week's Digests</title>" +
    "<style>" +
    "body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}" +
    "h1{font-size:1.4rem;margin-bottom:.25rem}" +
    ".subtitle{color:#666;font-size:.9rem;margin-bottom:2rem}" +
    "h2{font-size:1.1rem;margin-bottom:.25rem}" +
    ".meta{color:#888;font-size:.8rem;margin-top:0}" +
    "ul{padding-left:1.25rem}li{margin:12px 0}" +
    ".source{color:#888;font-size:.85rem}.source a{color:#666}" +
    "section{margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:1px solid #eee}" +
    "section:last-child{border-bottom:none}" +
    "</style></head><body>" +
    "<h1>This Week's Digests</h1>" +
    "<p class=\"subtitle\">Key insights curated from PM and industry blogs</p>" +
    body +
    "</body></html>";

  res.type("html").send(html);
});

// --- MCP endpoint ---

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; createdAt: number }>();

const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      console.error(`[mcp] Session expired: ${id}`);
    }
  }
}, 5 * 60 * 1000);

app.all("/mcp", express.json(), authMiddleware, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST") {
    if (!sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, createdAt: Date.now() });
          console.error(`[mcp] Session created: ${id}`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  if (req.method === "GET") {
    if (!sessionId) { res.status(400).json({ error: "Missing mcp-session-id header" }); return; }
    const session = sessions.get(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    await session.transport.handleRequest(req, res);
    return;
  }

  if (req.method === "DELETE") {
    if (!sessionId) { res.status(400).json({ error: "Missing mcp-session-id header" }); return; }
    const session = sessions.get(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    await session.transport.handleRequest(req, res);
    sessions.delete(sessionId);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
});

// --- Admin API ---

app.post("/admin/seed-sources", express.json(), authMiddleware, (req, res) => {
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

app.post("/admin/run-pipeline", express.json(), authMiddleware, async (req, res) => {
  const pipelineId = req.body?.pipeline_id as string | undefined;
  try {
    if (pipelineId) {
      console.error(`[admin] Manual run: ${pipelineId}`);
      const result = await runPipeline(pipelineId);
      res.json(result);
    } else {
      console.error(`[admin] Manual run: all pipelines`);
      const results = await runAllPipelines();
      res.json(results);
    }
  } catch (err) {
    console.error(`[admin] Pipeline run error:`, err);
    res.status(500).json({ error: String(err) });
  }
});

// --- Cron scheduling ---

if (cron.validate(config.cronSchedule)) {
  cron.schedule(config.cronSchedule, async () => {
    console.error(`[cron] Scheduled run starting`);
    try {
      const results = await runAllPipelines();
      console.error(`[cron] Completed: ${results.length} pipelines`);
    } catch (err) {
      console.error(`[cron] Error:`, err);
    }
  }, { timezone: config.cronTimezone });
  console.error(`[cron] Scheduled: ${config.cronSchedule} (${config.cronTimezone})`);
}

// --- Start ---

app.listen(config.httpPort, () => {
  console.error(`robin-digest listening on port ${config.httpPort}`);
  console.error(`MCP endpoint: http://localhost:${config.httpPort}/mcp`);
  console.error(`Admin: POST http://localhost:${config.httpPort}/admin/run-pipeline`);
  console.error(`Digests: http://localhost:${config.httpPort}/digests`);
});
