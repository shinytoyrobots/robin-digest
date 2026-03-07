import express from "express";
import crypto from "crypto";
import cron from "node-cron";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config, loadPipelineConfigs } from "./config.js";
import { getDb, upsertPipelines } from "./db.js";
import { createServer } from "./server.js";
import { runAllPipelines } from "./pipeline/runner.js";
import { generateDailyDirection } from "./direction/generator.js";
import { isFeaturePaused } from "./ui/shared.js";
import { digestsRouter } from "./routes/digests.js";
import { directionRouter } from "./routes/direction.js";
import { adminRouter } from "./routes/admin.js";

// Initialize database and load pipeline configs
getDb();
const pipelineConfigs = loadPipelineConfigs();
upsertPipelines(pipelineConfigs);
console.error(`[init] Loaded ${pipelineConfigs.length} pipeline configs`);

const app = express();

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
    "<p>Content curation pipeline. <a href=\"/digests\">View digests</a> &middot; <a href=\"/dailydirection\">Daily Direction</a> &middot; <a href=\"/sources\">Sources</a></p>" +
    "</body></html>"
  );
});

// --- Route modules ---

app.use(digestsRouter);
app.use(directionRouter);
app.use(authMiddleware, adminRouter);

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

// --- Cron scheduling ---

if (cron.validate(config.cronSchedule)) {
  cron.schedule(config.cronSchedule, async () => {
    if (isFeaturePaused("digest_paused_until")) {
      console.error(`[cron] Digest paused, skipping run`);
      return;
    }
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

if (cron.validate(config.directionCron)) {
  cron.schedule(config.directionCron, async () => {
    if (isFeaturePaused("direction_paused_until")) {
      console.error(`[cron] Direction paused, skipping run`);
      return;
    }
    console.error(`[cron] Daily direction generation starting`);
    try {
      const id = await generateDailyDirection();
      console.error(`[cron] Daily direction generated: #${id}`);
    } catch (err) {
      console.error(`[cron] Direction error:`, err);
    }
  }, { timezone: config.cronTimezone });
  console.error(`[cron] Direction scheduled: ${config.directionCron} (${config.cronTimezone})`);
}

// --- Start ---

app.listen(config.httpPort, () => {
  console.error(`robin-digest listening on port ${config.httpPort}`);
  console.error(`MCP endpoint: http://localhost:${config.httpPort}/mcp`);
  console.error(`Admin: POST http://localhost:${config.httpPort}/admin/run-pipeline`);
  console.error(`Digests: http://localhost:${config.httpPort}/digests`);
  console.error(`Direction: http://localhost:${config.httpPort}/dailydirection`);
});
