import express from "express";
import crypto from "crypto";
import cron from "node-cron";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config, loadPipelineConfigs } from "./config.js";
import { getDb, upsertPipelines } from "./db.js";
import { createServer } from "./server.js";
import { runPipeline, runAllPipelines } from "./pipeline/runner.js";
import { generateDailyDirection } from "./direction/generator.js";
import type { Suggestion } from "./direction/generator.js";

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
    "<p>Content curation pipeline. <a href=\"/digests\">View digests</a> &middot; <a href=\"/dailydirection\">Daily Direction</a></p>" +
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

// --- Daily Direction page ---

const CATEGORY_COLORS: Record<string, string> = {
  writing: "#6366f1",
  learning: "#0891b2",
  project: "#059669",
  connection: "#d97706",
  creative: "#c026d3",
};

type DirectionRow = { id: number; focus_angle: string; suggestions: string; created_at: string };

function renderHistorySection(
  pastDirections: DirectionRow[],
  feedbackByDirection: Map<number, Map<number, string>>
): string {
  if (pastDirections.length === 0) return "";

  let html = `<div class="history"><h2 class="history-heading">Yesterday</h2>`;

  for (const dir of pastDirections) {
    let suggestions: Suggestion[];
    try { suggestions = JSON.parse(dir.suggestions); } catch { suggestions = []; }

    const dateLabel = formatDate(dir.created_at);
    const feedbackMap = feedbackByDirection.get(dir.id) ?? new Map();

    html += `<details class="history-day"><summary>${esc(dateLabel)} &mdash; ${esc(dir.focus_angle.replace(/-/g, " "))}</summary>`;

    suggestions.forEach((s, i) => {
      const color = CATEGORY_COLORS[s.category] || "#666";
      const reaction = feedbackMap.get(i);
      html += `<div class="card history-card">`;
      html += `<span class="pill" style="background:${color}">${esc(s.category)}</span>`;
      html += `<h3>${esc(s.title)}</h3>`;
      html += `<p>${esc(s.body)}</p>`;
      if (reaction) {
        html += `<div class="feedback-done">Marked: <strong>${esc(reaction.replace(/_/g, " "))}</strong></div>`;
      }
      html += `</div>`;
    });

    html += `</details>`;
  }

  html += `</div>`;
  return html;
}

function renderDirectionPage(
  direction: DirectionRow | null,
  feedbackMap: Map<number, string>,
  historyHtml: string
): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Chicago",
  });

  let body = "";
  if (!direction) {
    body = `<p class="empty">No direction generated yet today. Check back after 6:30 AM CT.</p>`;
  } else {
    let suggestions: Suggestion[];
    try {
      suggestions = JSON.parse(direction.suggestions);
    } catch {
      suggestions = [];
    }

    body += `<p class="lens">Today's lens: <strong>${esc(direction.focus_angle.replace(/-/g, " "))}</strong></p>`;

    suggestions.forEach((s, i) => {
      const color = CATEGORY_COLORS[s.category] || "#666";
      const existing = feedbackMap.get(i);
      body += `<div class="card">`;
      body += `<span class="pill" style="background:${color}">${esc(s.category)}</span>`;
      body += `<h2>${esc(s.title)}</h2>`;
      body += `<p>${esc(s.body)}</p>`;
      if (s.source_refs?.length) {
        body += `<p class="refs">${s.source_refs.map((r) => esc(r)).join(" &middot; ")}</p>`;
      }
      if (existing) {
        body += `<div class="feedback-done">You marked this: <strong>${esc(existing)}</strong></div>`;
      } else {
        body += `<div class="feedback-row" data-direction="${direction.id}" data-index="${i}">`;
        body += `<button data-reaction="useful">Useful</button>`;
        body += `<button data-reaction="inspired">Inspired</button>`;
        body += `<button data-reaction="done">Done</button>`;
        body += `<button data-reaction="not_relevant">Not relevant</button>`;
        body += `<input type="text" placeholder="Optional note..." class="note-input">`;
        body += `</div>`;
      }
      body += `</div>`;
    });
  }

  return `<!DOCTYPE html><html><head><title>Daily Direction</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1a1a1a;line-height:1.6;background:#fafaf9}
h1{font-size:1.4rem;margin-bottom:0}
.date{color:#888;font-size:.9rem;margin-top:.25rem}
.lens{color:#555;font-size:.95rem;margin:1.5rem 0}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:1.25rem;margin-bottom:1.25rem}
.card h2{font-size:1.05rem;margin:.5rem 0 .25rem}
.card p{margin:.5rem 0;font-size:.95rem}
.pill{display:inline-block;color:#fff;font-size:.7rem;padding:2px 8px;border-radius:9999px;text-transform:uppercase;letter-spacing:.05em}
.refs{color:#888;font-size:.8rem}
.feedback-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:.75rem;align-items:center}
.feedback-row button{background:#f5f5f4;border:1px solid #d6d3d1;border-radius:6px;padding:4px 10px;font-size:.8rem;cursor:pointer;transition:background .15s}
.feedback-row button:hover{background:#e7e5e4}
.feedback-row button.selected{background:#059669;color:#fff;border-color:#059669}
.note-input{flex:1;min-width:120px;border:1px solid #d6d3d1;border-radius:6px;padding:4px 8px;font-size:.8rem}
.feedback-done{color:#059669;font-size:.85rem;margin-top:.75rem}
.empty{color:#888;margin-top:2rem}
.history{margin-top:2.5rem;border-top:1px solid #e5e5e5;padding-top:1.5rem}
.history-heading{font-size:1.1rem;color:#555;margin-bottom:1rem}
.history-day{margin-bottom:1rem}
.history-day summary{cursor:pointer;font-size:.95rem;color:#444;padding:.5rem 0}
.history-day summary:hover{color:#1a1a1a}
.history-card h3{font-size:.95rem;margin:.5rem 0 .25rem}
.footer{margin-top:2.5rem;color:#aaa;font-size:.8rem;border-top:1px solid #eee;padding-top:1rem}
.footer a{color:#888}
</style></head><body>
<h1>Daily Direction</h1>
<p class="date">${esc(today)}</p>
${body}
${historyHtml}
<div class="footer">Generated at 6:30 AM CT &middot; <a href="/">robin-cannon.dev</a></div>
<script>
document.querySelectorAll('.feedback-row button').forEach(btn => {
  btn.addEventListener('click', async function() {
    const row = this.closest('.feedback-row');
    const directionId = row.dataset.direction;
    const index = parseInt(row.dataset.index);
    const reaction = this.dataset.reaction;
    const note = row.querySelector('.note-input').value || undefined;
    try {
      const res = await fetch('/dailydirection/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction_id: parseInt(directionId), suggestion_index: index, reaction, note })
      });
      if (res.ok) {
        row.innerHTML = '<div class="feedback-done">Thanks! Marked as: <strong>' + reaction.replace('_', ' ') + '</strong></div>';
      }
    } catch(e) { console.error(e); }
  });
});
</script></body></html>`;
}

app.get("/dailydirection", (_req, res) => {
  const db = getDb();

  // Get today's direction (or most recent)
  const direction = db.prepare(
    `SELECT id, focus_angle, suggestions, created_at FROM daily_directions
     WHERE created_at > datetime('now', '-1 day')
     ORDER BY created_at DESC LIMIT 1`
  ).get() as DirectionRow | undefined;

  // Get existing feedback for this direction
  const feedbackMap = new Map<number, string>();
  if (direction) {
    const rows = db.prepare(
      "SELECT suggestion_index, reaction FROM direction_feedback WHERE direction_id = ?"
    ).all(direction.id) as { suggestion_index: number; reaction: string }[];
    for (const r of rows) {
      feedbackMap.set(r.suggestion_index, r.reaction);
    }
  }

  // Get yesterday's direction
  const pastDirections = db.prepare(
    `SELECT id, focus_angle, suggestions, created_at FROM daily_directions
     WHERE created_at <= datetime('now', '-1 day') AND created_at > datetime('now', '-2 days')
     ORDER BY created_at DESC LIMIT 1`
  ).all() as DirectionRow[];

  // Batch-fetch feedback for all past directions
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
  res.type("html").send(renderDirectionPage(direction ?? null, feedbackMap, historyHtml));
});

app.post("/dailydirection/feedback", express.json(), (req, res) => {
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

app.post("/admin/run-direction", express.json(), authMiddleware, async (_req, res) => {
  try {
    console.error("[admin] Manual direction generation");
    const id = await generateDailyDirection();
    const db = getDb();
    const direction = db.prepare("SELECT * FROM daily_directions WHERE id = ?").get(id);
    res.json(direction);
  } catch (err) {
    console.error("[admin] Direction generation error:", err);
    res.status(500).json({ error: String(err) });
  }
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

if (cron.validate(config.directionCron)) {
  cron.schedule(config.directionCron, async () => {
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
