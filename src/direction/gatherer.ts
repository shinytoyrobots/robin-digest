import { config } from "../config.js";
import { getDb, getSetting } from "../db.js";
import { parseFeed } from "../lib/rss.js";
import { stripHtml } from "../lib/html.js";

export interface GatheredContext {
  recentToolUsage: { tool: string; calls: number }[];
  activeContexts: string[];
  recentWritings: { title: string; url: string; category: "fiction" | "non-fiction"; excerpt: string }[];
  recentDigestSnippets: { insight: string; source: string; source_url: string; commentable: boolean; published_at: string | null; pipeline_id: string }[];
  recentFeedback: { reaction: string; suggestion_title: string; note?: string }[];
  missionStatement: string | null;
  recentlyRecommendedHosts: Set<string>;
}

const SECTION_FEEDS: { url: string; category: "fiction" | "non-fiction" }[] = [
  { url: "https://www.robin-cannon.com/feed?sectionId=240084", category: "non-fiction" }, // field-notes
  { url: "https://www.robin-cannon.com/feed?sectionId=240085", category: "non-fiction" }, // signals
  { url: "https://www.robin-cannon.com/feed?sectionId=240086", category: "fiction" },    // shiny-toy-robots
  { url: "https://www.robin-cannon.com/feed?sectionId=285509", category: "fiction" },    // alternate-frequencies
];

// --- Knowledge vault ---
const VAULT_REPO = "shinytoyrobots/knowledge-vault";
const VAULT_BASE = `https://api.github.com/repos/${VAULT_REPO}`;
const VAULT_API = `${VAULT_BASE}/contents`;

const VAULT_FICTION_POOLS = [
  "Fiction/Standalone/Flash",
  "Fiction/Standalone/Flash/Ripper and Rayne",
  "Fiction/StaticDrift/Shorts/Finals",
  "Fiction/StaticDrift/GlobalBible/Themes and Philosophies",
];

const VAULT_NONFICTION_POOLS = [
  "Non-Fiction/Field Notes",
  "Non-Fiction/Signals",
  "Non-Fiction/For submission",
];

// Non-content files to skip when listing vault pools
const VAULT_SKIP = new Set(["-Series Overview-.md", "README.md", "New Drama. Old Sins. Dangerous Chemistry..md"]);

const VAULT_FICTION_COUNT = 4;
const VAULT_NONFICTION_COUNT = 4;

// Domains where articles can be replied to (e.g. via Substack comments)
const COMMENTABLE_DOMAINS = ["substack.com"];

function isCommentable(url: string): boolean {
  return COMMENTABLE_DOMAINS.some(domain => url.includes(domain));
}

// Writing cache is considered fresh if populated within this window
const WRITING_CACHE_TTL_HOURS = 24;

function vaultHeaders(accept = "application/vnd.github+json"): Record<string, string> {
  const headers: Record<string, string> = { "Accept": accept, "User-Agent": "robin-digest" };
  if (config.githubToken) headers["Authorization"] = `Bearer ${config.githubToken}`;
  return headers;
}

/** Single API call: fetch the full repo tree and index files by pool directory. */
async function fetchVaultIndex(): Promise<Map<string, { title: string; vaultPath: string }[]>> {
  const allPools = [...VAULT_FICTION_POOLS, ...VAULT_NONFICTION_POOLS];
  const byPool = new Map<string, { title: string; vaultPath: string }[]>(allPools.map(p => [p, []]));

  const res = await fetch(`${VAULT_BASE}/git/trees/main?recursive=1`, {
    headers: vaultHeaders(),
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
  });
  if (!res.ok) throw new Error(`GitHub tree API: HTTP ${res.status}`);
  const { tree } = (await res.json()) as { tree: { path: string; type: string }[] };

  for (const item of tree) {
    if (item.type !== "blob" || !item.path.endsWith(".md")) continue;
    const filename = item.path.split("/").pop()!;
    if (VAULT_SKIP.has(filename)) continue;
    for (const poolPath of allPools) {
      const prefix = poolPath + "/";
      if (item.path.startsWith(prefix) && !item.path.slice(prefix.length).includes("/")) {
        byPool.get(poolPath)!.push({ title: filename.replace(/\.md$/, ""), vaultPath: item.path });
        break;
      }
    }
  }
  return byPool;
}

async function fetchVaultFile(vaultPath: string): Promise<string> {
  const encodedPath = vaultPath.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${VAULT_API}/${encodedPath}`, {
    headers: vaultHeaders("application/vnd.github.raw"),
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching vault file ${vaultPath}`);
  const text = await res.text();
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function sampleN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
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
    const db = getDb();

    // Return cached writings if they were fetched within the TTL window
    const cachedRows = db
      .prepare(
        `SELECT url, title, category, content, fetched_at FROM writing_cache
         WHERE fetched_at > datetime('now', '-${WRITING_CACHE_TTL_HOURS} hours')
         ORDER BY fetched_at DESC`
      )
      .all() as { url: string; title: string; category: string; content: string; fetched_at: string }[];

    if (cachedRows.length > 0) {
      console.error(`[direction] Writing cache hit (${cachedRows.length} entries)`);
      return cachedRows.map((r) => ({
        title: r.title,
        url: r.url,
        category: r.category as "fiction" | "non-fiction",
        excerpt: r.content,
      }));
    }

    // Cache is stale — fetch fresh from RSS feeds
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

    const rssSelected = [
      ...fiction.sort(byDate).slice(0, 4),
      ...nonFiction.sort(byDate).slice(0, 4),
    ];

    // --- Vault: random selection from knowledge vault pools ---
    const vaultArticles: RawArticle[] = [];
    try {
      const rssLookup = new Set(rssSelected.map(a => a.title.toLowerCase().trim()));

      const poolIndex = await fetchVaultIndex();
      const fictionFiles = VAULT_FICTION_POOLS.flatMap(p => poolIndex.get(p) ?? []);
      const nonfictionFiles = VAULT_NONFICTION_POOLS.flatMap(p => poolIndex.get(p) ?? []);

      const availFiction = fictionFiles.filter(f => !rssLookup.has(f.title.toLowerCase().trim()));
      const availNonfiction = nonfictionFiles.filter(f => !rssLookup.has(f.title.toLowerCase().trim()));

      await Promise.allSettled([
        ...sampleN(availFiction, VAULT_FICTION_COUNT).map(async f => {
          const content = await fetchVaultFile(f.vaultPath);
          vaultArticles.push({ url: `vault:${f.vaultPath}`, title: f.title, content, category: "fiction" });
        }),
        ...sampleN(availNonfiction, VAULT_NONFICTION_COUNT).map(async f => {
          const content = await fetchVaultFile(f.vaultPath);
          vaultArticles.push({ url: `vault:${f.vaultPath}`, title: f.title, content, category: "non-fiction" });
        }),
      ]);
      console.error(`[direction] Vault sample: ${vaultArticles.length} files (${vaultArticles.filter(a => a.category === "fiction").length} fiction, ${vaultArticles.filter(a => a.category === "non-fiction").length} non-fiction)`);
    } catch (err) {
      console.error("[direction] Vault fetch failed, continuing without vault context:", err);
    }

    const selected = [...rssSelected, ...vaultArticles];

    if (selected.length === 0) return [];

    // Rebuild writing cache with fresh data
    const currentUrls = selected.map((a) => a.url);
    const placeholders = currentUrls.map(() => "?").join(",");
    db.prepare(`DELETE FROM writing_cache WHERE url NOT IN (${placeholders})`).run(...currentUrls);

    const insert = db.prepare(
      "INSERT OR REPLACE INTO writing_cache (url, title, category, content, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))"
    );
    db.transaction(() => {
      for (const article of selected) {
        if (article.content) {
          const excerpt =
            article.category === "fiction"
              ? truncateToWords(article.content, 500)
              : truncateToWords(article.content, 250, 250);
          insert.run(article.url, article.title, article.category, excerpt);
        }
      }
    })();

    console.error(`[direction] Writing cache refreshed (${rssSelected.length} RSS + ${vaultArticles.length} vault)`);

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
    // Select up to 3 snippets per pipeline to ensure all 6 categories are represented,
    // rather than taking the 15 most recent globally (which lets active pipelines crowd out quieter ones).
    const rows = db
      .prepare(
        `WITH ranked AS (
           SELECT s.key_insight, s.source_name, s.source_url, a.published_at, d.pipeline_id,
                  ROW_NUMBER() OVER (PARTITION BY d.pipeline_id ORDER BY d.created_at DESC) AS rn
           FROM snippets s
           JOIN digests d ON s.digest_id = d.id
           LEFT JOIN articles a ON s.source_article_id = a.id
           WHERE d.created_at > datetime('now', '-7 days')
         )
         SELECT key_insight, source_name, source_url, published_at, pipeline_id
         FROM ranked
         WHERE rn <= 3
         ORDER BY pipeline_id, rn`
      )
      .all() as { key_insight: string; source_name: string; source_url: string; published_at: string | null; pipeline_id: string }[];
    const snippets = rows.map((r) => ({
      insight: r.key_insight,
      source: r.source_name,
      source_url: r.source_url,
      commentable: isCommentable(r.source_url),
      published_at: r.published_at,
      pipeline_id: r.pipeline_id,
    }));
    // Shuffle to avoid primacy bias — Claude over-weights items early in context
    for (let i = snippets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [snippets[i], snippets[j]] = [snippets[j], snippets[i]];
    }
    return snippets;
  } catch (err) {
    console.error("[direction] Failed to fetch digest snippets:", err);
    return [];
  }
}

function fetchRecentFeedback(): GatheredContext["recentFeedback"] {
  try {
    const db = getDb();

    // Group feedback rows by direction_id to avoid re-parsing suggestions JSON per row
    const rows = db
      .prepare(
        `SELECT df.reaction, df.note, df.suggestion_index, df.direction_id, dd.suggestions
         FROM direction_feedback df
         JOIN daily_directions dd ON df.direction_id = dd.id
         WHERE df.created_at > datetime('now', '-7 days')
         ORDER BY df.created_at DESC
         LIMIT 20`
      )
      .all() as { reaction: string; note: string | null; suggestion_index: number; direction_id: number; suggestions: string }[];

    // Parse each direction's suggestions JSON once, keyed by direction_id
    const parsedByDirection = new Map<number, { title?: string }[]>();
    for (const row of rows) {
      if (!parsedByDirection.has(row.direction_id)) {
        try {
          parsedByDirection.set(row.direction_id, JSON.parse(row.suggestions) as { title?: string }[]);
        } catch {
          parsedByDirection.set(row.direction_id, []);
        }
      }
    }

    return rows.map((r) => {
      const suggestions = parsedByDirection.get(r.direction_id) ?? [];
      const title = suggestions[r.suggestion_index]?.title ?? `Suggestion #${r.suggestion_index + 1}`;
      return { reaction: r.reaction, suggestion_title: title, note: r.note ?? undefined };
    });
  } catch (err) {
    console.error("[direction] Failed to fetch feedback:", err);
    return [];
  }
}

function fetchRecentlyRecommendedHosts(): Set<string> {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT suggestions FROM daily_directions
         WHERE created_at > datetime('now', '-3 days')
         ORDER BY created_at DESC`
      )
      .all() as { suggestions: string }[];

    const hosts = new Set<string>();
    for (const row of rows) {
      try {
        const suggestions = JSON.parse(row.suggestions) as { category?: string; source_url?: string }[];
        for (const s of suggestions) {
          if (s.category === "engage" && s.source_url) {
            try {
              const host = new URL(s.source_url).hostname.replace(/^www\./, "");
              hosts.add(host);
            } catch {
              // malformed URL — skip
            }
          }
        }
      } catch {
        // malformed JSON — skip
      }
    }
    return hosts;
  } catch (err) {
    console.error("[direction] Failed to fetch recently recommended hosts:", err);
    return new Set();
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
  const recentlyRecommendedHosts = fetchRecentlyRecommendedHosts();

  return { recentToolUsage, activeContexts, recentWritings, recentDigestSnippets, recentFeedback, missionStatement, recentlyRecommendedHosts };
}
