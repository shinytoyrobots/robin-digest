import express from "express";
import { getSetting, setSetting } from "../db.js";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function isFeaturePaused(settingKey: string): boolean {
  const until = getSetting(settingKey);
  if (!until) return false;
  return getTodayIso() <= until;
}

export function renderSourceRef(ref: string): string {
  const pipeIdx = ref.indexOf("|");
  if (pipeIdx > 0) {
    const text = ref.slice(0, pipeIdx).trim();
    const url = ref.slice(pipeIdx + 1).trim();
    if (url.startsWith("http")) {
      return `<a href="${esc(url)}">${esc(text)}</a>`;
    }
  }
  return esc(ref);
}

export function renderSourceRefs(refs: string[]): string {
  return refs.map(renderSourceRef).join(" &middot; ");
}

export const SHARED_CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'IBM Plex Sans',sans-serif;max-width:672px;margin:0 auto;padding:48px 16px;background:#fff;color:#161616;line-height:1.5;font-size:.875rem}
h1{font-size:1.75rem;font-weight:600;letter-spacing:0;margin-bottom:4px}
.toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:1.25rem}
.pause-ctrl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pause-form{display:flex;align-items:center;gap:6px}
.pause-label{color:#525252;font-size:.75rem;white-space:nowrap}
.pause-badge{color:#6f6f6f;font-size:.8125rem}
.date-input{border:1px solid #8d8d8d;padding:3px 6px;font-size:.75rem;font-family:'IBM Plex Sans',sans-serif}
.btn-action{background:#0f62fe;color:#fff;border:none;padding:5px 14px;font-size:.8125rem;font-family:'IBM Plex Sans',sans-serif;cursor:pointer}
.btn-action:hover{background:#0353e9}
.btn-outline{background:transparent;color:#525252;border:1px solid #8d8d8d;padding:4px 10px;font-size:.75rem;font-family:'IBM Plex Sans',sans-serif;cursor:pointer}
.btn-outline:hover{background:#e0e0e0;border-color:#525252}
.btn-link{background:none;border:none;color:#0f62fe;font-size:.8125rem;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;padding:0;text-decoration:underline}
.notice{background:#edf5ff;border-left:3px solid #0f62fe;padding:.625rem 1rem;margin-bottom:1rem;font-size:.8125rem;color:#161616}
.section-heading{font-size:1rem;font-weight:600;color:#161616;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid #e0e0e0}
.yesterday-toggle{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
.yesterday-toggle::-webkit-details-marker{display:none}
.yesterday-toggle::before{content:'';display:inline-block;width:0;height:0;border-left:5px solid #525252;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .15s}
details[open]>.yesterday-toggle::before{transform:rotate(90deg)}
.toggle-hint{color:#6f6f6f;font-weight:400;font-size:.75rem}
.empty-state{color:#6f6f6f;margin-top:2rem}
.footer{margin-top:2.5rem;color:#a8a8a8;font-size:.75rem;border-top:1px solid #e0e0e0;padding-top:1rem}
.footer a{color:#0f62fe;text-decoration:none}`;

export const FONT_LINK = `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">`;

/**
 * Creates pause/resume route handlers for a feature controlled by a settings key.
 * Usage: router.use(createPauseRouter("digest_paused_until", "/digests"))
 */
export function createPauseRouter(settingKey: string, redirectPath: string): express.Router {
  const router = express.Router();
  const tag = `[${settingKey.replace(/_paused_until$/, "")}]`;

  router.post(`${redirectPath}/pause`, express.urlencoded({ extended: false }), (req, res) => {
    const until = req.body.until as string;
    if (!until || until < getTodayIso()) { res.redirect(redirectPath); return; }
    setSetting(settingKey, until);
    console.error(`${tag} Paused until ${until}`);
    res.redirect(redirectPath);
  });

  router.post(`${redirectPath}/resume`, (_req, res) => {
    setSetting(settingKey, null);
    console.error(`${tag} Resumed`);
    res.redirect(redirectPath);
  });

  return router;
}
