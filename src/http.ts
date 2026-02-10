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
app.use(express.json());

// Landing page
app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html><head><title>Robin Digest</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:60px auto;padding:0 20px;color:#333}
h1{font-size:1.5rem}code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:0.9em}
li{margin:8px 0}.muted{color:#888;font-size:0.85rem}</style></head>
<body>
<h1>Robin Digest</h1>
<p>Content curation pipeline — fetches blog content, curates knowledge snippets via Claude, and exposes results as an MCP server.</p>
<h3>Endpoints</h3>
<ul>
<li><strong>MCP:</strong> <code>/mcp</code></li>
<li><strong>Admin:</strong> <code>POST /admin/run-pipeline</code></li>
</ul>
<p class="muted">Part of the robin-mcp ecosystem</p>
</body></html>`);
});

// Auth middleware for /mcp and /admin
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!config.authToken) {
    next();
    return;
  }
  const bearer = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;
  if (bearer === `Bearer ${config.authToken}` || queryToken === config.authToken) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

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

app.all("/mcp", authMiddleware, async (req, res) => {
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
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  if (req.method === "GET") {
    if (!sessionId) {
      res.status(400).json({ error: "Missing mcp-session-id header" });
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await session.transport.handleRequest(req, res);
    return;
  }

  if (req.method === "DELETE") {
    if (!sessionId) {
      res.status(400).json({ error: "Missing mcp-session-id header" });
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await session.transport.handleRequest(req, res);
    sessions.delete(sessionId);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
});

// --- Admin API ---

app.post("/admin/run-pipeline", authMiddleware, async (req, res) => {
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
});
