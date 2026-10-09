import { getDb } from "../db.js";
import { stripHtml, fetchHtml, extractArticleText } from "../lib/html.js";
import { parseFeed } from "../lib/rss.js";
import { concurrent } from "../lib/concurrency.js";
import { config } from "../config.js";
import type { Source, FetchedArticle } from "../types.js";

/** Minimum word count for an article to be stored. Below this threshold the content
 *  is almost certainly a paywall stub ("This post is for paid subscribers") with no
 *  curate-able substance. */
const MIN_CONTENT_WORDS = 150;

/** Only the newest N feed items of a summary-only source are considered for page fetches. */
const MAX_PAGE_FETCHES_PER_RUN = 20;

/**
 * Fetch new articles from all enabled sources with RSS/Atom feeds.
 */
export async function fetchArticles(pipelineId: string): Promise<number> {
  const db = getDb();
  const sources = db.prepare(
    "SELECT * FROM sources WHERE pipeline_id = ? AND enabled = 1 AND feed_url IS NOT NULL"
  ).all(pipelineId) as Source[];

  const counts = await concurrent(sources, 5, async (source) => {
    try {
      const feedUrl = source.feed_url!;
      const feedType = source.feed_type as "rss" | "atom";

      const res = await fetch(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(config.fetchTimeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching feed ${feedUrl}`);
      const xml = await res.text();

      let rawArticles = parseFeed(xml, feedType).map((a) => ({
        ...a,
        content: stripHtml(a.content).slice(0, 5000),
      }));

      // Summary-only feeds carry excerpts, so fetch each new article's page for its full text.
      // The word-count gate below then applies to the page text, not the excerpt.
      if (source.summary_only) {
        rawArticles = await fetchFullArticles(rawArticles, source.name);
      }

      const articles = rawArticles.filter((a) => {
        const wordCount = a.content.split(/\s+/).filter(Boolean).length;
        if (wordCount < MIN_CONTENT_WORDS) {
          console.error(`[fetcher] Skipping "${a.title}" — ${wordCount} words (likely paywall stub)`);
          return false;
        }
        return true;
      });

      const inserted = storeArticles(source, articles);

      db.prepare(
        "UPDATE sources SET last_fetched_at = datetime('now') WHERE id = ?"
      ).run(source.id);

      console.error(`[fetcher] ${source.name}: ${inserted} new articles (${articles.length} found)`);
      return inserted;
    } catch (err) {
      console.error(`[fetcher] Error fetching ${source.name}: ${err}`);
      return 0;
    }
  });

  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * Replace excerpt content with the article page's body text. Skips articles already
 * stored (so pages are fetched once) and drops any whose page can't be fetched.
 */
async function fetchFullArticles(articles: FetchedArticle[], sourceName: string): Promise<FetchedArticle[]> {
  const existing = getDb().prepare("SELECT 1 FROM articles WHERE url = ?");
  // Some feeds carry their whole archive (OpenAI's has 1,000+ items) — only consider the newest items
  const fresh = [...articles]
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, MAX_PAGE_FETCHES_PER_RUN)
    .filter((a) => !existing.get(a.url));

  const full = await concurrent(fresh, 3, async (a) => {
    try {
      const content = extractArticleText(await fetchHtml(a.url)).slice(0, 5000);
      return { ...a, content };
    } catch (err) {
      console.error(`[fetcher] ${sourceName}: failed to fetch article page "${a.title}": ${err}`);
      return null;
    }
  });
  return full.filter((a): a is FetchedArticle => a !== null);
}

function storeArticles(source: Source, articles: FetchedArticle[]): number {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO articles (source_id, url, title, author, published_at, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const a of articles) {
      const result = insert.run(source.id, a.url, a.title, a.author || null, a.published_at || null, a.content);
      if (result.changes > 0) inserted++;
    }
  });
  tx();
  return inserted;
}
