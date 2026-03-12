import { esc, SHARED_CSS, FONT_LINK } from "./shared.js";

type SourceRow = { pipeline_id: string; pipeline_name: string; name: string; url: string; enabled: number; latest_article_at: string | null };
type PipelineInfo = { id: string; name: string };

const SOURCE_LIMIT = 20;

const PAGE_CSS = `${SHARED_CSS}
.pipeline-section{margin-bottom:2.5rem}
.source-table{width:100%;border-collapse:collapse;margin-top:.75rem}
.source-table th{text-align:left;font-size:.75rem;font-weight:600;color:#525252;text-transform:uppercase;letter-spacing:.04em;padding:.375rem .5rem;border-bottom:2px solid #e0e0e0}
.source-table td{padding:.5rem .5rem;border-bottom:1px solid #e0e0e0;font-size:.8125rem;vertical-align:middle}
.source-table td:first-child{font-weight:500;width:38%}
.source-table td:nth-child(2){color:#6f6f6f;font-family:'IBM Plex Mono',monospace;font-size:.75rem}
.source-table td:last-child{width:56px;text-align:right}
.source-table a{color:#0f62fe;text-decoration:none}
.source-table a:hover{text-decoration:underline}
.disabled{opacity:.45}
.disabled-tag{display:inline-block;background:#e0e0e0;color:#525252;font-size:.6875rem;padding:1px 5px;border-radius:2px;font-family:'IBM Plex Mono',monospace;margin-left:6px;vertical-align:middle}
.stale-tag{display:inline-block;background:#fff1f1;color:#da1e28;font-size:.6875rem;padding:1px 5px;border-radius:2px;font-family:'IBM Plex Mono',monospace;margin-left:6px;vertical-align:middle;border:1px solid #ffd7d9}
.count{color:#6f6f6f;font-size:.8125rem;font-weight:400;margin-left:6px}
.count-warn{color:#d4a017;font-size:.8125rem;font-weight:600;margin-left:6px}
.count-full{color:#da1e28;font-size:.8125rem;font-weight:600;margin-left:6px}
.btn-del{background:none;border:none;color:#da1e28;font-size:.75rem;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;padding:2px 4px;opacity:.55}
.btn-del:hover{opacity:1;text-decoration:underline}
.add-box{background:#f4f4f4;padding:1rem 1.25rem;margin-bottom:2rem}
.add-box h3{font-size:.875rem;font-weight:600;margin-bottom:.75rem;color:#161616}
.add-row{display:flex;gap:8px;align-items:center}
.add-row input{flex:1;border:1px solid #8d8d8d;padding:5px 8px;font-size:.8125rem;font-family:'IBM Plex Sans',sans-serif}
.suggest-result{background:#edf5ff;border-left:3px solid #0f62fe;padding:.75rem 1rem;margin-top:.75rem;display:none}
.field-group{margin-bottom:.625rem}
.field-label{display:block;font-size:.75rem;font-weight:600;color:#525252;margin-bottom:3px}
.field-input,.field-select{width:100%;border:1px solid #8d8d8d;padding:5px 8px;font-size:.8125rem;font-family:'IBM Plex Sans',sans-serif;background:#fff;box-sizing:border-box}
.rationale{color:#525252;font-size:.75rem;font-style:italic;margin-bottom:.75rem}
.confirm-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.limit-msg{color:#da1e28;font-size:.75rem;display:none}
.suggest-error{background:#fff1f1;border-left:3px solid #da1e28;padding:.5rem 1rem;margin-top:.5rem;font-size:.8125rem;color:#161616;display:none}`;

export function renderSourcesPage(sources: SourceRow[], pipelines: PipelineInfo[], token: string): string {
  const byPipeline = new Map<string, { name: string; sources: SourceRow[] }>();
  for (const s of sources) {
    if (!byPipeline.has(s.pipeline_id)) {
      byPipeline.set(s.pipeline_id, { name: s.pipeline_name, sources: [] });
    }
    byPipeline.get(s.pipeline_id)!.sources.push(s);
  }

  // Per-pipeline total counts for JS cap enforcement
  const pipelineCounts: Record<string, number> = {};
  for (const [pid, p] of byPipeline) {
    pipelineCounts[pid] = p.sources.length;
  }

  let body = "";
  for (const [pid, pipeline] of byPipeline) {
    const total = pipeline.sources.length;
    const enabled = pipeline.sources.filter(s => s.enabled).length;
    const countClass = total >= SOURCE_LIMIT ? "count-full" : total >= SOURCE_LIMIT - 2 ? "count-warn" : "count";

    body += `<section class="pipeline-section">`;
    body += `<h2 class="section-heading">${esc(pipeline.name)} <span class="${countClass}">${total} / ${SOURCE_LIMIT} · ${enabled} active</span></h2>`;
    body += `<table class="source-table"><thead><tr><th>Name</th><th>URL</th><th></th></tr></thead><tbody>`;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    for (const s of pipeline.sources) {
      const isStale = !s.latest_article_at || s.latest_article_at < thirtyDaysAgo;
      const disabledTag = s.enabled ? "" : `<span class="disabled-tag">disabled</span>`;
      const staleTag = isStale ? `<span class="stale-tag" title="${s.latest_article_at ? `Last article: ${s.latest_article_at.slice(0, 10)}` : "No articles fetched"}">stale</span>` : "";
      body += `<tr class="${s.enabled ? "" : "disabled"}">`;
      body += `<td>${esc(s.name)}${disabledTag}${staleTag}</td>`;
      body += `<td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></td>`;
      body += `<td><button class="btn-del" onclick="deleteSource(${esc(JSON.stringify(pid))},${esc(JSON.stringify(s.url))},${esc(JSON.stringify(s.name))})">Delete</button></td>`;
      body += `</tr>`;
    }
    body += `</tbody></table></section>`;
  }

  const pipelineOptions = pipelines.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  const total = sources.length;
  const totalEnabled = sources.filter(s => s.enabled).length;

  const script = `
const TOKEN = ${JSON.stringify(token)};
const pipelineCounts = ${JSON.stringify(pipelineCounts)};
let suggestData = null;

async function suggestSource() {
  const url = document.getElementById('add-url').value.trim();
  if (!url) { document.getElementById('add-url').focus(); return; }
  const btn = document.getElementById('suggest-btn');
  const errEl = document.getElementById('suggest-error');
  errEl.style.display = 'none';
  document.getElementById('suggest-result').style.display = 'none';
  btn.disabled = true; btn.textContent = 'Analyzing\u2026';
  try {
    const res = await fetch('/admin/suggest-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      const e = await res.json();
      errEl.textContent = e.error; errEl.style.display = '';
      return;
    }
    suggestData = await res.json();
    document.getElementById('suggest-name').value = suggestData.name;
    document.getElementById('suggest-rationale').textContent = suggestData.rationale;
    const sel = document.getElementById('suggest-pipeline');
    sel.value = suggestData.pipeline_id;
    document.getElementById('suggest-result').style.display = '';
    updateConfirmBtn();
  } catch (e) {
    errEl.textContent = 'Request failed: ' + e.message; errEl.style.display = '';
  } finally {
    btn.disabled = false; btn.textContent = 'Suggest';
  }
}

function updateConfirmBtn() {
  const pid = document.getElementById('suggest-pipeline').value;
  const count = pipelineCounts[pid] || 0;
  const btn = document.getElementById('confirm-btn');
  const msg = document.getElementById('limit-msg');
  if (count >= 20) { btn.disabled = true; msg.style.display = ''; }
  else { btn.disabled = false; msg.style.display = 'none'; }
}

async function confirmSource() {
  if (!suggestData) return;
  const pipeline_id = document.getElementById('suggest-pipeline').value;
  const name = document.getElementById('suggest-name').value.trim();
  const btn = document.getElementById('confirm-btn');
  btn.disabled = true; btn.textContent = 'Adding\u2026';
  try {
    const res = await fetch('/admin/seed-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ pipeline_id, sources: [{ name, url: suggestData.url, feed_url: suggestData.feed_url, feed_type: suggestData.feed_type }] })
    });
    if (res.ok) { location.reload(); }
    else {
      const e = await res.json();
      alert('Failed to add source: ' + e.error);
      btn.disabled = false; btn.textContent = 'Add Source';
    }
  } catch (e) {
    alert('Request failed: ' + e.message);
    btn.disabled = false; btn.textContent = 'Add Source';
  }
}

async function deleteSource(pipelineId, url, name) {
  if (!confirm('Delete "' + name + '"?\\n\\nThis cannot be undone.')) return;
  const res = await fetch('/admin/delete-source', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
    body: JSON.stringify({ pipeline_id: pipelineId, url })
  });
  if (res.ok) { location.reload(); }
  else { const e = await res.json(); alert('Delete failed: ' + e.error); }
}

document.getElementById('add-url').addEventListener('keydown', e => {
  if (e.key === 'Enter') suggestSource();
});`;

  return `<!DOCTYPE html><html><head><title>Sources</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${FONT_LINK}
<style>${PAGE_CSS}</style></head><body>
<h1>Sources</h1>
<p style="color:#525252;font-size:.875rem;margin-bottom:1.5rem">${totalEnabled} active sources across ${byPipeline.size} pipelines (${total - totalEnabled} disabled)</p>

<div class="add-box">
<h3>Add Source</h3>
<div class="add-row">
  <input type="url" id="add-url" placeholder="https://example.com" autocomplete="off">
  <button class="btn-action" id="suggest-btn" onclick="suggestSource()">Suggest</button>
</div>
<div class="suggest-error" id="suggest-error"></div>
<div class="suggest-result" id="suggest-result">
  <div class="field-group">
    <label class="field-label" for="suggest-name">Name</label>
    <input class="field-input" type="text" id="suggest-name">
  </div>
  <div class="field-group">
    <label class="field-label" for="suggest-pipeline">Pipeline</label>
    <select class="field-select" id="suggest-pipeline" onchange="updateConfirmBtn()">${pipelineOptions}</select>
  </div>
  <p class="rationale" id="suggest-rationale"></p>
  <div class="confirm-row">
    <button class="btn-action" id="confirm-btn" onclick="confirmSource()">Add Source</button>
    <span class="limit-msg" id="limit-msg">Pipeline is at the ${SOURCE_LIMIT}-source limit — delete a source first.</span>
  </div>
</div>
</div>

${body}

<div class="footer">robin-digest &middot; <a href="/digests">Digests</a> &middot; <a href="/dailydirection">Daily Direction</a></div>
<script>${script}</script>
</body></html>`;
}
