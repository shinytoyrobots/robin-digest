import { esc, getTodayIso, renderSourceRefs, SHARED_CSS, FONT_LINK } from "./shared.js";
import type { Suggestion } from "../direction/generator.js";
import type { StoredSong } from "../direction/spotify.js";

export type DirectionRow = { id: number; focus_angle: string; suggestions: string; created_at: string };
export type TokenAvg = { avgIn: number; avgOut: number; avgCostUsd: number; n: number };

const PAGE_CSS = `${SHARED_CSS}
.date{color:#525252;font-size:.875rem;margin-top:0;margin-bottom:1rem}
.lens{color:#525252;font-size:.875rem;margin:.5rem 0 .75rem}
.card{background:#f4f4f4;border-left:3px solid #0f62fe;padding:1rem 1.25rem;margin-bottom:1rem}
.card-title{font-size:.9375rem;font-weight:600;margin:.375rem 0 .25rem}
.card-body{margin:.375rem 0;font-size:.875rem;color:#161616}
h2.card-title{font-size:.9375rem}
h3.card-title{font-size:.875rem}
.pill{display:inline-block;color:#fff;font-size:.6875rem;padding:1px 8px;border-radius:2px;text-transform:uppercase;letter-spacing:.04em;font-family:'IBM Plex Mono',monospace;font-weight:400}
.refs{color:#6f6f6f;font-size:.75rem;margin-top:.5rem}.refs a{color:#0f62fe;text-decoration:none}.refs a:hover{text-decoration:underline}
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
.history{margin-top:2rem;border-top:1px solid #e0e0e0;padding-top:1rem}
.model-select{border:1px solid #8d8d8d;border-radius:0;padding:4px 8px;font-size:.75rem;font-family:'IBM Plex Sans',sans-serif;background:#fff;cursor:pointer}
.model-select:focus{outline:2px solid #0f62fe;outline-offset:-2px}
.song-section{margin-top:2rem;padding-top:1rem;border-top:1px solid #e0e0e0}
.song-card{background:#f4f4f4;border-left:3px solid #1db954;padding:1rem 1.25rem;margin-bottom:1rem;display:flex;gap:1rem;align-items:flex-start}
.song-art{width:80px;height:80px;border-radius:2px;flex-shrink:0;object-fit:cover}
.song-art-placeholder{width:80px;height:80px;background:#e0e0e0;border-radius:2px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#8d8d8d;font-size:1.5rem}
.song-info{flex:1;min-width:0}
.song-title{font-size:.9375rem;font-weight:600;margin:0 0 2px}
.song-artist{font-size:.8125rem;color:#525252;margin:0 0 2px}
.song-album{font-size:.75rem;color:#6f6f6f;margin:0 0 .5rem}
.song-reason{font-size:.8125rem;color:#161616;margin:0 0 .75rem;font-style:italic}
.song-actions{display:flex;align-items:center;gap:8px}
.song-link{color:#1db954;font-weight:500;text-decoration:none;font-size:.8125rem}
.song-link:hover{text-decoration:underline}
`;


const CATEGORY_COLORS: Record<string, string> = {
  writing: "#6366f1",
  learning: "#0891b2",
  project: "#059669",
  connection: "#d97706",
  creative: "#c026d3",
  engage: "#e11d48",
};

function feedbackButtons(reactions: string[]): string {
  return reactions.map(r => `<button data-reaction="${r}">${r.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}</button>`).join("\n");
}

export function renderHistorySection(
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

function renderSongCard(song: StoredSong): string {
  const art = song.album_art_url
    ? `<img class="song-art" src="${esc(song.album_art_url)}" alt="Album art">`
    : `<div class="song-art-placeholder">&#9835;</div>`;

  const releaseInfo = song.release_date ? ` &middot; ${esc(song.release_date)}` : "";

  let feedbackHtml: string;
  if (song.reaction) {
    feedbackHtml = `<div class="feedback-done">You marked this: <strong>${esc(song.reaction.replace(/_/g, " "))}</strong></div>`;
  } else {
    feedbackHtml = `<div class="feedback-row" data-song-id="${song.id}">
      <button data-reaction="good_choice">Good choice</button>
      <button data-reaction="didnt_resonate">Didn't resonate</button>
    </div>`;
  }

  return `<section class="song-section">
<h2 class="section-heading">Song of the day</h2>
<div class="song-card">
  ${art}
  <div class="song-info">
    <p class="song-title">${esc(song.title)}</p>
    <p class="song-artist">${esc(song.artist)}</p>
    <p class="song-album">${esc(song.album ?? "")}${releaseInfo}</p>
    <p class="song-reason">${esc(song.reason)}</p>
    <div class="song-actions">
      <a class="song-link" href="${esc(song.spotify_url)}" target="_blank" rel="noopener">Listen on Spotify &rarr;</a>
    </div>
    ${feedbackHtml}
  </div>
</div>
</section>`;
}

export function renderDirectionPage(
  direction: DirectionRow | null,
  feedbackMap: Map<number, string>,
  historyHtml: string,
  notice?: string,
  dirPausedUntil?: string | null,
  avgTokens?: TokenAvg | null,
  song?: StoredSong | null
): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Chicago",
  });

  const todayIso = getTodayIso();

  const generatedAt = direction
    ? new Date(direction.created_at.replace(" ", "T") + "Z").toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
      }) + " CT"
    : null;

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
    const engageSuggestions = suggestions.filter(s => s.category === "engage");

    regularSuggestions.forEach((s) => {
      const color = CATEGORY_COLORS[s.category] || "#6f6f6f";
      const originalIndex = suggestions.indexOf(s);
      const existing = feedbackMap.get(originalIndex);
      suggestionsHtml += `<div class="card">`;
      suggestionsHtml += `<span class="pill" style="background:${color}">${esc(s.category)}</span>`;
      suggestionsHtml += `<h2 class="card-title">${esc(s.title)}</h2>`;
      suggestionsHtml += `<p class="card-body">${esc(s.body)}</p>`;
      if (s.source_refs?.length) {
        suggestionsHtml += `<p class="refs">${renderSourceRefs(s.source_refs)}</p>`;
      }
      if (existing) {
        suggestionsHtml += `<div class="feedback-done">You marked this: <strong>${esc(existing)}</strong></div>`;
      } else {
        suggestionsHtml += `<div class="feedback-row" data-direction="${direction.id}" data-index="${originalIndex}">`;
        suggestionsHtml += feedbackButtons(["useful", "inspired", "done", "not_relevant"]);
        suggestionsHtml += `<input type="text" placeholder="Optional note..." class="note-input">`;
        suggestionsHtml += `</div>`;
      }
      suggestionsHtml += `</div>`;
    });

    if (engageSuggestions.length > 0) {
      engageHtml += `<section class="engage-section">`;
      engageHtml += `<h2 class="section-heading">Go engage</h2>`;
      for (const engageSuggestion of engageSuggestions) {
        const engageIndex = suggestions.indexOf(engageSuggestion);
        const existing = feedbackMap.get(engageIndex);
        engageHtml += `<div class="card engage-card">`;
        engageHtml += `<span class="pill" style="background:${CATEGORY_COLORS.engage}">${esc(engageSuggestion.category)}</span>`;
        engageHtml += `<h2 class="card-title">${esc(engageSuggestion.title)}</h2>`;
        engageHtml += `<p class="card-body">${esc(engageSuggestion.body)}</p>`;
        if (engageSuggestion.source_url) {
          engageHtml += `<p class="engage-link"><a href="${esc(engageSuggestion.source_url)}">Read &amp; reply &rarr;</a></p>`;
        }
        if (engageSuggestion.source_refs?.length) {
          engageHtml += `<p class="refs">${renderSourceRefs(engageSuggestion.source_refs)}</p>`;
        }
        if (existing) {
          engageHtml += `<div class="feedback-done">You marked this: <strong>${esc(existing)}</strong></div>`;
        } else {
          engageHtml += `<div class="feedback-row" data-direction="${direction.id}" data-index="${engageIndex}">`;
          engageHtml += feedbackButtons(["useful", "done", "not_relevant"]);
          engageHtml += `<input type="text" placeholder="Optional note..." class="note-input">`;
          engageHtml += `</div>`;
        }
        engageHtml += `</div>`;
      }
      engageHtml += `</section>`;
    }
  }

  const pauseCtrl = dirPausedUntil && todayIso <= dirPausedUntil
    ? `<span class="pause-badge">&#9646; Paused until ${esc(dirPausedUntil)}</span><form method="POST" action="/dailydirection/resume" style="margin:0"><button type="submit" class="btn-link">Resume</button></form>`
    : `<form method="POST" action="/dailydirection/pause" class="pause-form" style="margin:0"><span class="pause-label">Pause until</span><input type="date" name="until" min="${todayIso}" class="date-input" required><button type="submit" class="btn-outline">Pause</button></form>`;

  return `<!DOCTYPE html><html><head><title>Daily Direction</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${FONT_LINK}
<style>${PAGE_CSS}</style></head><body>
<h1>Daily Direction</h1>
<p class="date">${esc(today)}</p>
${notice === "generating" ? `<div class="notice">New direction generating — refresh in a moment.</div>` : ""}
<div class="toolbar">
  <form method="POST" action="/dailydirection/refresh" style="margin:0;display:flex;gap:6px;align-items:center">
    <select name="model" class="model-select">
      <option value="claude-sonnet-4-6">Sonnet</option>
      <option value="claude-haiku-4-5-20251001">Haiku</option>
    </select>
    <button type="submit" class="btn-action">&#8635; Regenerate</button>
  </form>
  <div class="pause-ctrl">${pauseCtrl}</div>
</div>
${suggestionsHtml}
${engageHtml}
${song ? renderSongCard(song) : ""}
${historyHtml}
<div class="footer">${generatedAt ? `Generated at ${generatedAt}` : "Daily Direction"} &middot; <a href="/">robin-cannon.dev</a>${avgTokens ? ` &middot; avg ~$${avgTokens.avgCostUsd.toFixed(4)}/run &middot; ${avgTokens.avgIn.toLocaleString()} in / ${avgTokens.avgOut.toLocaleString()} out tokens (${avgTokens.n} runs, 30d)` : ""}</div>
<script>
if (window.location.search.includes('status=generating')) {
  history.replaceState(null, '', window.location.pathname);
  const baseline = ${JSON.stringify(direction?.created_at ?? null)};
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    try {
      const r = await fetch('/dailydirection/latest-timestamp');
      const d = await r.json();
      if (d.created_at !== baseline) { clearInterval(poll); window.location.reload(); return; }
    } catch(e) {}
    if (attempts >= 4) clearInterval(poll);
  }, 30000);
}
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
document.querySelectorAll('.feedback-row[data-song-id] button').forEach(btn => {
  btn.addEventListener('click', async function() {
    const row = this.closest('.feedback-row');
    const songId = parseInt(row.dataset.songId);
    const reaction = this.dataset.reaction;
    try {
      const res = await fetch('/dailydirection/song-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_id: songId, reaction })
      });
      if (res.ok) {
        row.innerHTML = '<div class="feedback-done">You marked this: <strong>' + reaction.replace('_', ' ') + '</strong></div>';
      }
    } catch(e) { console.error(e); }
  });
});
</script></body></html>`;
}
