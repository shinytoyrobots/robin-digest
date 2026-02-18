import { config } from "../config.js";
import { getDb } from "../db.js";
import { parseFeed } from "../lib/rss.js";

export interface GatheredContext {
  recentToolUsage: { tool: string; calls: number }[];
  activeContexts: string[];
  recentWritings: { title: string; url: string }[];
  recentDigestSnippets: { insight: string; source: string; source_url: string; commentable: boolean }[];
  recentFeedback: { reaction: string; suggestion_title: string; note?: string }[];
}

async function fetchJson(url: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.robinMcpToken) {
    headers["Authorization"] = `Bearer ${config.robinMcpToken}`;
  }
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchToolUsage(): Promise<GatheredContext["recentToolUsage"]> {
  try {
    const data = (await fetchJson(`${config.robinMcpUrl}/dashboard/api/stats?period=7d`)) as {
      tool_usage?: { tool: string; calls: number }[];
    };
    return data.tool_usage ?? [];
  } catch (err) {
    console.error("[direction] Failed to fetch tool usage:", err);
    return [];
  }
}

async function fetchActiveContexts(): Promise<string[]> {
  try {
    const data = (await fetchJson(`${config.robinMcpUrl}/dashboard/api/routing`)) as {
      routes?: { context: string }[];
    };
    return data.routes?.map((r) => r.context) ?? [];
  } catch (err) {
    console.error("[direction] Failed to fetch routing:", err);
    return [];
  }
}

async function fetchRecentWritings(): Promise<GatheredContext["recentWritings"]> {
  try {
    const res = await fetch("https://www.robin-cannon.com/feed", {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const articles = parseFeed(xml, "rss");
    return articles.slice(0, 5).map((a) => ({ title: a.title, url: a.url }));
  } catch (err) {
    console.error("[direction] Failed to fetch writings:", err);
    return [];
  }
}

function fetchRecentDigestSnippets(): GatheredContext["recentDigestSnippets"] {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT s.key_insight, s.source_name, s.source_url
         FROM snippets s
         JOIN digests d ON s.digest_id = d.id
         WHERE d.created_at > datetime('now', '-7 days')
         ORDER BY d.created_at DESC
         LIMIT 15`
      )
      .all() as { key_insight: string; source_name: string; source_url: string }[];
    return rows.map((r) => ({
      insight: r.key_insight,
      source: r.source_name,
      source_url: r.source_url,
      commentable: r.source_url.includes("substack.com"),
    }));
  } catch (err) {
    console.error("[direction] Failed to fetch digest snippets:", err);
    return [];
  }
}

function fetchRecentFeedback(): GatheredContext["recentFeedback"] {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT df.reaction, df.note, df.suggestion_index, dd.suggestions
         FROM direction_feedback df
         JOIN daily_directions dd ON df.direction_id = dd.id
         WHERE df.created_at > datetime('now', '-7 days')
         ORDER BY df.created_at DESC
         LIMIT 20`
      )
      .all() as { reaction: string; note: string | null; suggestion_index: number; suggestions: string }[];

    return rows.map((r) => {
      let title = `Suggestion #${r.suggestion_index + 1}`;
      try {
        const parsed = JSON.parse(r.suggestions);
        if (parsed[r.suggestion_index]?.title) {
          title = parsed[r.suggestion_index].title;
        }
      } catch { /* use default title */ }
      return { reaction: r.reaction, suggestion_title: title, note: r.note ?? undefined };
    });
  } catch (err) {
    console.error("[direction] Failed to fetch feedback:", err);
    return [];
  }
}

export async function gatherContext(): Promise<GatheredContext> {
  const [recentToolUsage, activeContexts, recentWritings] = await Promise.all([
    fetchToolUsage(),
    fetchActiveContexts(),
    fetchRecentWritings(),
  ]);

  const recentDigestSnippets = fetchRecentDigestSnippets();
  const recentFeedback = fetchRecentFeedback();

  return { recentToolUsage, activeContexts, recentWritings, recentDigestSnippets, recentFeedback };
}
