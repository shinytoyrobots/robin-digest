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

  // Get latest digest per pipeline for today (deduplicated)
  const todayDigests = db.prepare(
    "SELECT d.*, p.name as pipeline_name FROM digests d " +
    "JOIN pipelines p ON d.pipeline_id = p.id " +
    "WHERE d.created_at > datetime('now', '-1 day') " +
    "AND d.id = (SELECT id FROM digests d2 WHERE d2.pipeline_id = d.pipeline_id AND d2.created_at > datetime('now', '-1 day') ORDER BY d2.created_at DESC LIMIT 1) " +
    "ORDER BY d.created_at DESC"
  ).all() as { id: number; pipeline_id: string; title: string; created_at: string; pipeline_name: string }[];

  // Get latest digest per pipeline for yesterday (deduplicated)
  const yesterdayDigests = db.prepare(
    "SELECT d.*, p.name as pipeline_name FROM digests d " +
    "JOIN pipelines p ON d.pipeline_id = p.id " +
    "WHERE d.created_at <= datetime('now', '-1 day') AND d.created_at > datetime('now', '-2 days') " +
    "AND d.id = (SELECT id FROM digests d2 WHERE d2.pipeline_id = d.pipeline_id AND d2.created_at <= datetime('now', '-1 day') AND d2.created_at > datetime('now', '-2 days') ORDER BY d2.created_at DESC LIMIT 1) " +
    "ORDER BY d.created_at DESC"
  ).all() as { id: number; pipeline_id: string; title: string; created_at: string; pipeline_name: string }[];

  type SnippetRow = { key_insight: string; source_name: string; source_url: string; is_fresh: number };

  function renderDigestSection(digest: typeof todayDigests[0]): string {
    const snippets = db.prepare(
      "SELECT key_insight, source_name, source_url, is_fresh FROM snippets WHERE digest_id = ? ORDER BY position"
    ).all(digest.id) as SnippetRow[];

    let html = `<div class="digest-card">`;
    html += `<h3 class="digest-title">${esc(digest.title)}</h3>`;
    html += `<p class="digest-meta">${esc(digest.pipeline_name)} &middot; ${formatDate(digest.created_at)}</p>`;
    html += `<ul class="snippet-list">`;
    for (const s of snippets) {
      const archiveTag = s.is_fresh === 0 ? ` <span class="archive-tag">from archive</span>` : "";
      html += `<li>${esc(s.key_insight)}${archiveTag} <span class="source">&mdash; <a href="${esc(s.source_url)}">${esc(s.source_name)}</a></span></li>`;
    }
    html += `</ul></div>`;
    return html;
  }

  let body = "";
  if (todayDigests.length === 0 && yesterdayDigests.length === 0) {
    body = `<p class="empty-state">No digests yet. Check back after 3:00 AM CT.</p>`;
  } else {
    if (todayDigests.length > 0) {
      body += `<section class="digest-section"><h2 class="section-heading">Today</h2>`;
      for (const d of todayDigests) body += renderDigestSection(d);
      body += `</section>`;
    }
    if (yesterdayDigests.length > 0) {
      body += `<section class="digest-section yesterday">`;
      body += `<details><summary class="section-heading yesterday-toggle">Yesterday <span class="toggle-hint">${yesterdayDigests.length} digest${yesterdayDigests.length > 1 ? "s" : ""}</span></summary>`;
      for (const d of yesterdayDigests) body += renderDigestSection(d);
      body += `</details></section>`;
    }
  }

  const html = `<!DOCTYPE html><html><head><title>Daily Digests</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'IBM Plex Sans',sans-serif;max-width:672px;margin:0 auto;padding:48px 16px;background:#fff;color:#161616;line-height:1.5;font-size:.875rem}
h1{font-size:1.75rem;font-weight:600;letter-spacing:0;margin-bottom:4px}
.subtitle{color:#525252;font-size:.875rem;margin-bottom:2rem}
.section-heading{font-size:1rem;font-weight:600;color:#161616;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid #e0e0e0}
.yesterday-toggle{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
.yesterday-toggle::-webkit-details-marker{display:none}
.yesterday-toggle::before{content:'';display:inline-block;width:0;height:0;border-left:5px solid #525252;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .15s}
details[open]>.yesterday-toggle::before{transform:rotate(90deg)}
.toggle-hint{color:#6f6f6f;font-weight:400;font-size:.75rem}
.digest-section{margin-bottom:2rem}
.yesterday{border-top:1px solid #e0e0e0;padding-top:1rem}
.digest-card{background:#f4f4f4;border-left:3px solid #0f62fe;padding:1rem 1.25rem;margin-bottom:1rem;border-radius:0}
.digest-title{font-size:.9375rem;font-weight:600;margin-bottom:2px}
.digest-meta{color:#6f6f6f;font-size:.75rem;margin-bottom:.75rem}
.snippet-list{padding-left:1rem;list-style:none}
.snippet-list li{margin:10px 0;position:relative;padding-left:.75rem}
.snippet-list li::before{content:'';position:absolute;left:0;top:8px;width:4px;height:4px;background:#0f62fe;border-radius:50%}
.source{color:#6f6f6f;font-size:.8125rem}
.source a{color:#0f62fe;text-decoration:none}
.source a:hover{text-decoration:underline}
.archive-tag{display:inline-block;background:#e0e0e0;color:#525252;font-size:.6875rem;padding:1px 6px;border-radius:2px;font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.02em;vertical-align:middle;margin-left:4px}
.empty-state{color:#6f6f6f;margin-top:2rem}
.footer{margin-top:2.5rem;color:#a8a8a8;font-size:.75rem;border-top:1px solid #e0e0e0;padding-top:1rem}
.footer a{color:#0f62fe;text-decoration:none}
</style></head><body>
<h1>Daily Digests</h1>
<p class="subtitle">Key insights curated daily from newsletters and blogs</p>
${body}
<div class="footer">Generated at 3:00 AM CT &middot; <a href="/">robin-cannon.dev</a></div>
</body></html>`;

  res.type("html").send(html);
});

// --- Daily Direction page ---

const CATEGORY_COLORS: Record<string, string> = {
  writing: "#6366f1",
  learning: "#0891b2",
  project: "#059669",
  connection: "#d97706",
  creative: "#c026d3",
  engage: "#e11d48",
};

type DirectionRow = { id: number; focus_angle: string; suggestions: string; created_at: string };

function renderHistorySection(
  pastDirections: DirectionRow[],
  feedbackByDirection: Map<number, Map<number, string>>
): string {
  if (pastDirections.length === 0) return "";

  let html = `<section class="history"><details><summary class="section-heading yesterday-toggle">Yesterday <span class="toggle-hint">${pastDirections.length} direction${pastDirections.length > 1 ? "s" : ""}</span></summary>`;

  for (const dir of pastDirections) {
    let suggestions: Suggestion[];
    try { suggestions = JSON.parse(dir.suggestions); } catch { suggestions = []; }

    const feedbackMap = feedbackByDirection.get(dir.id) ?? new Map();

    html += `<p class="lens">Lens: <strong>${esc(dir.focus_angle.replace(/-/g, " "))}</strong></p>`;

    suggestions.forEach((s, i) => {
      const color = CATEGORY_COLORS[s.category] || "#6f6f6f";
      const reaction = feedbackMap.get(i);
      const isEngage = s.category === "engage";
      html += `<div class="card${isEngage ? " engage-card" : ""}">`;
      html += `<span class="pill" style="background:${color}">${esc(s.category)}</span>`;
      html += `<h3 class="card-title">${esc(s.title)}</h3>`;
      html += `<p class="card-body">${esc(s.body)}</p>`;
      if (reaction) {
        html += `<div class="feedback-done">Marked: <strong>${esc(reaction.replace(/_/g, " "))}</strong></div>`;
      }
      html += `</div>`;
    });
  }

  html += `</details></section>`;
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

  let suggestionsHtml = "";
  let engageHtml = "";

  if (!direction) {
    suggestionsHtml = `<p class="empty-state">No direction generated yet today. Check back after 3:30 AM CT.</p>`;
  } else {
    let suggestions: Suggestion[];
    try {
      suggestions = JSON.parse(direction.suggestions);
    } catch {
      suggestions = [];
    }

    suggestionsHtml += `<p class="lens">Today&rsquo;s lens: <strong>${esc(direction.focus_angle.replace(/-/g, " "))}</strong></p>`;

    const regularSuggestions = suggestions.filter(s => s.category !== "engage");
    const engageSuggestion = suggestions.find(s => s.category === "engage");

    regularSuggestions.forEach((s, i) => {
      const color = CATEGORY_COLORS[s.category] || "#6f6f6f";
      const originalIndex = suggestions.indexOf(s);
      const existing = feedbackMap.get(originalIndex);
      suggestionsHtml += `<div class="card">`;
      suggestionsHtml += `<span class="pill" style="background:${color}">${esc(s.category)}</span>`;
      suggestionsHtml += `<h2 class="card-title">${esc(s.title)}</h2>`;
      suggestionsHtml += `<p class="card-body">${esc(s.body)}</p>`;
      if (s.source_refs?.length) {
        suggestionsHtml += `<p class="refs">${s.source_refs.map((r) => esc(r)).join(" &middot; ")}</p>`;
      }
      if (existing) {
        suggestionsHtml += `<div class="feedback-done">You marked this: <strong>${esc(existing)}</strong></div>`;
      } else {
        suggestionsHtml += `<div class="feedback-row" data-direction="${direction.id}" data-index="${originalIndex}">`;
        suggestionsHtml += `<button data-reaction="useful">Useful</button>`;
        suggestionsHtml += `<button data-reaction="inspired">Inspired</button>`;
        suggestionsHtml += `<button data-reaction="done">Done</button>`;
        suggestionsHtml += `<button data-reaction="not_relevant">Not relevant</button>`;
        suggestionsHtml += `<input type="text" placeholder="Optional note..." class="note-input">`;
        suggestionsHtml += `</div>`;
      }
      suggestionsHtml += `</div>`;
    });

    if (engageSuggestion) {
      const engageIndex = suggestions.indexOf(engageSuggestion);
      const existing = feedbackMap.get(engageIndex);
      engageHtml += `<section class="engage-section">`;
      engageHtml += `<h2 class="section-heading">Go engage</h2>`;
      engageHtml += `<div class="card engage-card">`;
      engageHtml += `<span class="pill" style="background:${CATEGORY_COLORS.engage}">${esc(engageSuggestion.category)}</span>`;
      engageHtml += `<h2 class="card-title">${esc(engageSuggestion.title)}</h2>`;
      engageHtml += `<p class="card-body">${esc(engageSuggestion.body)}</p>`;
      if (engageSuggestion.source_url) {
        engageHtml += `<p class="engage-link"><a href="${esc(engageSuggestion.source_url)}">Read &amp; reply &rarr;</a></p>`;
      }
      if (engageSuggestion.source_refs?.length) {
        engageHtml += `<p class="refs">${engageSuggestion.source_refs.map((r) => esc(r)).join(" &middot; ")}</p>`;
      }
      if (existing) {
        engageHtml += `<div class="feedback-done">You marked this: <strong>${esc(existing)}</strong></div>`;
      } else {
        engageHtml += `<div class="feedback-row" data-direction="${direction.id}" data-index="${engageIndex}">`;
        engageHtml += `<button data-reaction="useful">Useful</button>`;
        engageHtml += `<button data-reaction="done">Done</button>`;
        engageHtml += `<button data-reaction="not_relevant">Not relevant</button>`;
        engageHtml += `<input type="text" placeholder="Optional note..." class="note-input">`;
        engageHtml += `</div>`;
      }
      engageHtml += `</div></section>`;
    }
  }

  return `<!DOCTYPE html><html><head><title>Daily Direction</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'IBM Plex Sans',sans-serif;max-width:672px;margin:0 auto;padding:48px 16px;background:#fff;color:#161616;line-height:1.5;font-size:.875rem}
h1{font-size:1.75rem;font-weight:600;letter-spacing:0;margin-bottom:4px}
.date{color:#525252;font-size:.875rem;margin-top:0}
.lens{color:#525252;font-size:.875rem;margin:1.25rem 0 .75rem}
.section-heading{font-size:1rem;font-weight:600;color:#161616;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid #e0e0e0}
.card{background:#f4f4f4;border-left:3px solid #0f62fe;padding:1rem 1.25rem;margin-bottom:1rem}
.card-title{font-size:.9375rem;font-weight:600;margin:.375rem 0 .25rem}
.card-body{margin:.375rem 0;font-size:.875rem;color:#161616}
h2.card-title{font-size:.9375rem}
h3.card-title{font-size:.875rem}
.pill{display:inline-block;color:#fff;font-size:.6875rem;padding:1px 8px;border-radius:2px;text-transform:uppercase;letter-spacing:.04em;font-family:'IBM Plex Mono',monospace;font-weight:400}
.refs{color:#6f6f6f;font-size:.75rem;margin-top:.5rem}
.feedback-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:.75rem;align-items:center}
.feedback-row button{background:#fff;border:1px solid #8d8d8d;border-radius:0;padding:4px 12px;font-size:.75rem;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;transition:background .15s,border-color .15s}
.feedback-row button:hover{background:#e0e0e0;border-color:#161616}
.feedback-row button:focus{outline:2px solid #0f62fe;outline-offset:1px}
.note-input{flex:1;min-width:120px;border:1px solid #8d8d8d;border-radius:0;padding:4px 8px;font-size:.75rem;font-family:'IBM Plex Sans',sans-serif}
.note-input:focus{outline:2px solid #0f62fe;outline-offset:-2px}
.feedback-done{color:#198038;font-size:.8125rem;margin-top:.75rem}
.engage-section{margin-top:2rem;padding-top:1rem;border-top:1px solid #e0e0e0}
.engage-card{border-left-color:#e11d48}
.engage-link{margin-top:.5rem}
.engage-link a{color:#e11d48;font-weight:500;text-decoration:none;font-size:.875rem}
.engage-link a:hover{text-decoration:underline}
.empty-state{color:#6f6f6f;margin-top:2rem}
.history{margin-top:2rem;border-top:1px solid #e0e0e0;padding-top:1rem}
.yesterday-toggle{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
.yesterday-toggle::-webkit-details-marker{display:none}
.yesterday-toggle::before{content:'';display:inline-block;width:0;height:0;border-left:5px solid #525252;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .15s}
details[open]>.yesterday-toggle::before{transform:rotate(90deg)}
.toggle-hint{color:#6f6f6f;font-weight:400;font-size:.75rem}
.footer{margin-top:2.5rem;color:#a8a8a8;font-size:.75rem;border-top:1px solid #e0e0e0;padding-top:1rem}
.footer a{color:#0f62fe;text-decoration:none}
</style></head><body>
<h1>Daily Direction</h1>
<p class="date">${esc(today)}</p>
${suggestionsHtml}
${engageHtml}
${historyHtml}
<div class="footer">Generated at 3:30 AM CT &middot; <a href="/">robin-cannon.dev</a></div>
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
        row.innerHTML = '<div class="feedback-done">Marked: <strong>' + reaction.replace('_', ' ') + '</strong></div>';
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
