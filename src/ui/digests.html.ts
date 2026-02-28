import { esc, formatDate, getTodayIso, SHARED_CSS, FONT_LINK } from "./shared.js";

type DigestRow = { id: number; pipeline_id: string; title: string; created_at: string; pipeline_name: string };
type SnippetRow = { key_insight: string; source_name: string; source_url: string; is_fresh: number };

const PAGE_CSS = `${SHARED_CSS}
.subtitle{color:#525252;font-size:.875rem;margin-bottom:1rem}
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
.archive-tag{display:inline-block;background:#e0e0e0;color:#525252;font-size:.6875rem;padding:1px 6px;border-radius:2px;font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.02em;vertical-align:middle;margin-left:4px}`;

function renderDigestCard(digest: DigestRow, snippets: SnippetRow[]): string {
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

export function renderDigestsPage(
  todayDigests: DigestRow[],
  yesterdayDigests: DigestRow[],
  snippetsByDigest: Map<number, SnippetRow[]>,
  digestPaused: boolean,
  digestPausedUntil: string | null,
  notice?: string
): string {
  const todayIso = getTodayIso();

  let body = "";
  if (todayDigests.length === 0 && yesterdayDigests.length === 0) {
    body = `<p class="empty-state">No digests yet. Check back after 3:00 AM CT.</p>`;
  } else {
    if (todayDigests.length > 0) {
      body += `<section class="digest-section"><h2 class="section-heading">Today</h2>`;
      for (const d of todayDigests) body += renderDigestCard(d, snippetsByDigest.get(d.id) ?? []);
      body += `</section>`;
    }
    if (yesterdayDigests.length > 0) {
      body += `<section class="digest-section yesterday">`;
      body += `<details><summary class="section-heading yesterday-toggle">Yesterday <span class="toggle-hint">${yesterdayDigests.length} digest${yesterdayDigests.length > 1 ? "s" : ""}</span></summary>`;
      for (const d of yesterdayDigests) body += renderDigestCard(d, snippetsByDigest.get(d.id) ?? []);
      body += `</details></section>`;
    }
  }

  const pauseCtrl = digestPaused
    ? `<span class="pause-badge">&#9646; Paused until ${esc(digestPausedUntil!)}</span><form method="POST" action="/digests/resume" style="margin:0"><button type="submit" class="btn-link">Resume</button></form>`
    : `<form method="POST" action="/digests/pause" class="pause-form" style="margin:0"><span class="pause-label">Pause until</span><input type="date" name="until" min="${esc(todayIso)}" class="date-input" required><button type="submit" class="btn-outline">Pause</button></form>`;

  return `<!DOCTYPE html><html><head><title>Daily Digests</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${FONT_LINK}
<style>${PAGE_CSS}</style></head><body>
<h1>Daily Digests</h1>
<p class="subtitle">Key insights curated daily from newsletters and blogs</p>
${notice === "refresh_queued" ? `<div class="notice">Refresh queued — check back in a few minutes.</div>` : ""}
<div class="toolbar">
  <form method="POST" action="/digests/refresh" style="margin:0"><button type="submit" class="btn-action">&#8635; Refresh</button></form>
  <div class="pause-ctrl">${pauseCtrl}</div>
</div>
${body}
<div class="footer">Generated at 3:00 AM CT &middot; <a href="/">robin-cannon.dev</a></div>
</body></html>`;
}
