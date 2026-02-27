import { config } from "../config.js";
import { getDb, getSetting } from "../db.js";
import { parseFeed } from "../lib/rss.js";
import { stripHtml } from "../lib/html.js";

export interface GatheredContext {
  recentToolUsage: { tool: string; calls: number }[];
  activeContexts: string[];
  recentWritings: { title: string; url: string; category: "fiction" | "non-fiction"; excerpt: string }[];
  recentDigestSnippets: { insight: string; source: string; source_url: string; commentable: boolean; published_at: string | null }[];
  recentFeedback: { reaction: string; suggestion_title: string; note?: string }[];
  missionStatement: string | null;
}

const SECTION_FEEDS: { url: string; category: "fiction" | "non-fiction" }[] = [
  { url: "https://www.robin-cannon.com/feed?sectionId=240084", category: "non-fiction" }, // field-notes
  { url: "https://www.robin-cannon.com/feed?sectionId=240085", category: "non-fiction" }, // signals
  { url: "https://www.robin-cannon.com/feed?sectionId=240086", category: "fiction" },    // shiny-toy-robots
  { url: "https://www.robin-cannon.com/feed?sectionId=285509", category: "fiction" },    // alternate-frequencies
];

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

function truncateToWords(text: string, first: number, last?: number): string {
  const plain = stripHtml(text);
  const words = plain.split(/\s+/).filter(Boolean);
  if (!last || words.length <= first + last) {
    return words.slice(0, first + (last ?? 0)).join(" ");
  }
  return `${words.slice(0, first).join(" ")} [...] ${words.slice(-last).join(" ")}`;
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

async function fetchWritingsWithContent(): Promise<GatheredContext["recentWritings"]> {
  try {
    type RawArticle = { url: string; title: string; published_at?: string; content: string; category: "fiction" | "non-fiction" };

    const results = await Promise.allSettled(
      SECTION_FEEDS.map(async ({ url, category }) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(config.fetchTimeoutMs) });
        if (!res.ok) return [] as RawArticle[];
        const xml = await res.text();
        const articles = parseFeed(xml, "rss");
        return articles.map((a): RawArticle => ({
          url: a.url,
          title: a.title,
          published_at: a.published_at,
          content: a.content ?? "",
          category,
        }));
      })
    );

    const fiction: RawArticle[] = [];
    const nonFiction: RawArticle[] = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const article of result.value) {
        (article.category === "fiction" ? fiction : nonFiction).push(article);
      }
    }

    const byDate = (a: RawArticle, b: RawArticle) => {
      const da = a.published_at ? new Date(a.published_at).getTime() : 0;
      const db2 = b.published_at ? new Date(b.published_at).getTime() : 0;
      return db2 - da;
    };

    const selected = [
      ...fiction.sort(byDate).slice(0, 4),
      ...nonFiction.sort(byDate).slice(0, 4),
    ];

    if (selected.length === 0) return [];

    const db = getDb();
    const currentUrls = selected.map((a) => a.url);
    const placeholders = currentUrls.map(() => "?").join(",");

    // Delete entries no longer in the current top-8
    db.prepare(`DELETE FROM writing_cache WHERE url NOT IN (${placeholders})`).run(...currentUrls);

    // Find which are already cached
    const cachedRows = db
      .prepare(`SELECT url FROM writing_cache WHERE url IN (${placeholders})`)
      .all(...currentUrls) as { url: string }[];
    const cached = new Set(cachedRows.map((r) => r.url));

    // Insert new entries
    const insert = db.prepare(
      "INSERT OR IGNORE INTO writing_cache (url, title, category, content, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))"
    );
    for (const article of selected) {
      if (!cached.has(article.url) && article.content) {
        const excerpt =
          article.category === "fiction"
            ? truncateToWords(article.content, 500)
            : truncateToWords(article.content, 250, 250);
        insert.run(article.url, article.title, article.category, excerpt);
      }
    }

    // Return from cache
    const rows = db
      .prepare(`SELECT url, title, category, content FROM writing_cache WHERE url IN (${placeholders})`)
      .all(...currentUrls) as { url: string; title: string; category: string; content: string }[];

    return rows.map((r) => ({
      title: r.title,
      url: r.url,
      category: r.category as "fiction" | "non-fiction",
      excerpt: r.content,
    }));
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
        `SELECT s.key_insight, s.source_name, s.source_url, a.published_at
         FROM snippets s
         JOIN digests d ON s.digest_id = d.id
         LEFT JOIN articles a ON s.source_article_id = a.id
         WHERE d.created_at > datetime('now', '-7 days')
         ORDER BY d.created_at DESC
         LIMIT 15`
      )
      .all() as { key_insight: string; source_name: string; source_url: string; published_at: string | null }[];
    return rows.map((r) => ({
      insight: r.key_insight,
      source: r.source_name,
      source_url: r.source_url,
      commentable: r.source_url.includes("substack.com"),
      published_at: r.published_at,
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

function fetchMissionStatement(): string | null {
  try {
    return getSetting("direction.mission_statement");
  } catch (err) {
    console.error("[direction] Failed to fetch mission statement:", err);
    return null;
  }
}

export async function gatherContext(): Promise<GatheredContext> {
  const [recentToolUsage, activeContexts, recentWritings] = await Promise.all([
    fetchToolUsage(),
    fetchActiveContexts(),
    fetchWritingsWithContent(),
  ]);

  const recentDigestSnippets = fetchRecentDigestSnippets();
  const recentFeedback = fetchRecentFeedback();
  const missionStatement = fetchMissionStatement();

  return { recentToolUsage, activeContexts, recentWritings, recentDigestSnippets, recentFeedback, missionStatement };
}
