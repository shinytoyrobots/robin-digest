import { esc, SHARED_CSS, FONT_LINK } from "./shared.js";

type SourceRow = { pipeline_id: string; pipeline_name: string; name: string; url: string; enabled: number };

const PAGE_CSS = `${SHARED_CSS}
.pipeline-section{margin-bottom:2.5rem}
.source-table{width:100%;border-collapse:collapse;margin-top:.75rem}
.source-table th{text-align:left;font-size:.75rem;font-weight:600;color:#525252;text-transform:uppercase;letter-spacing:.04em;padding:.375rem .5rem;border-bottom:2px solid #e0e0e0}
.source-table td{padding:.5rem .5rem;border-bottom:1px solid #e0e0e0;font-size:.8125rem;vertical-align:top}
.source-table td:first-child{font-weight:500;width:40%}
.source-table td:last-child{color:#6f6f6f;font-family:'IBM Plex Mono',monospace;font-size:.75rem}
.source-table a{color:#0f62fe;text-decoration:none}
.source-table a:hover{text-decoration:underline}
.disabled{opacity:.45}
.disabled-tag{display:inline-block;background:#e0e0e0;color:#525252;font-size:.6875rem;padding:1px 5px;border-radius:2px;font-family:'IBM Plex Mono',monospace;margin-left:6px;vertical-align:middle}
.count{color:#6f6f6f;font-size:.8125rem;font-weight:400;margin-left:6px}`;

export function renderSourcesPage(sources: SourceRow[]): string {
  const byPipeline = new Map<string, { name: string; sources: SourceRow[] }>();
  for (const s of sources) {
    if (!byPipeline.has(s.pipeline_id)) {
      byPipeline.set(s.pipeline_id, { name: s.pipeline_name, sources: [] });
    }
    byPipeline.get(s.pipeline_id)!.sources.push(s);
  }

  let body = "";
  for (const [, pipeline] of byPipeline) {
    const enabled = pipeline.sources.filter(s => s.enabled).length;
    body += `<section class="pipeline-section">`;
    body += `<h2 class="section-heading">${esc(pipeline.name)} <span class="count">${enabled} of ${pipeline.sources.length} active</span></h2>`;
    body += `<table class="source-table"><thead><tr><th>Name</th><th>URL</th></tr></thead><tbody>`;
    for (const s of pipeline.sources) {
      const disabledTag = s.enabled ? "" : `<span class="disabled-tag">disabled</span>`;
      body += `<tr class="${s.enabled ? "" : "disabled"}">`;
      body += `<td>${esc(s.name)}${disabledTag}</td>`;
      body += `<td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></td>`;
      body += `</tr>`;
    }
    body += `</tbody></table></section>`;
  }

  const total = sources.length;
  const totalEnabled = sources.filter(s => s.enabled).length;

  return `<!DOCTYPE html><html><head><title>Sources</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${FONT_LINK}
<style>${PAGE_CSS}</style></head><body>
<h1>Sources</h1>
<p class="subtitle" style="color:#525252;font-size:.875rem;margin-bottom:1.5rem">${totalEnabled} active sources across ${byPipeline.size} pipelines (${total - totalEnabled} disabled)</p>
${body}
<div class="footer">robin-digest &middot; <a href="/digests">Digests</a> &middot; <a href="/dailydirection">Daily Direction</a></div>
</body></html>`;
}
