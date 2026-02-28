import { getDb } from "../db.js";
import { stripHtml } from "../lib/html.js";
import { parseFeed } from "../lib/rss.js";
import { concurrent } from "../lib/concurrency.js";
import { config } from "../config.js";
import type { Source, FetchedArticle } from "../types.js";

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

      const articles = parseFeed(xml, feedType).map((a) => ({
        ...a,
        content: stripHtml(a.content).slice(0, 5000),
      }));

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
