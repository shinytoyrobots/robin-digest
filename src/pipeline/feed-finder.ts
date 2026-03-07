import { getDb } from "../db.js";
import { fetchHtml, extractFeedLinks } from "../lib/html.js";
import { concurrent } from "../lib/concurrency.js";
import type { Source } from "../types.js";

const COMMON_FEED_PATHS = ["/feed", "/rss", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml"];

/**
 * For each source without a feed_url, attempt to discover an RSS/Atom feed.
 * Tries: 1) <link rel="alternate"> in HTML, 2) common feed paths.
 */
export async function findFeeds(pipelineId: string): Promise<number> {
  const db = getDb();
  const sources = db.prepare(
    "SELECT * FROM sources WHERE pipeline_id = ? AND feed_url IS NULL AND enabled = 1"
  ).all(pipelineId) as Source[];

  const results = await concurrent<Source, number>(sources, 3, async (source) => {
    try {
      const feedInfo = await discoverFeed(source.url);
      if (feedInfo) {
        db.prepare(
          "UPDATE sources SET feed_url = ?, feed_type = ? WHERE id = ?"
        ).run(feedInfo.url, feedInfo.type, source.id);
        console.error(`[feed-finder] Found ${feedInfo.type} feed for ${source.name}: ${feedInfo.url}`);
        return 1;
      } else {
        db.prepare("UPDATE sources SET enabled = 0 WHERE id = ?").run(source.id);
        console.error(`[feed-finder] No feed found for ${source.name}, disabling source`);
        return 0;
      }
    } catch (err) {
      console.error(`[feed-finder] Error probing ${source.name}: ${err}`);
      db.prepare("UPDATE sources SET enabled = 0 WHERE id = ?").run(source.id);
      return 0;
    }
  });

  return results.reduce((sum, n) => sum + n, 0);
}

export async function discoverFeedForUrl(url: string): Promise<{ url: string; type: "rss" | "atom" } | null> {
  return discoverFeed(url);
}

async function discoverFeed(baseUrl: string): Promise<{ url: string; type: "rss" | "atom" } | null> {
  // Try fetching the page and looking for <link rel="alternate">
  try {
    const html = await fetchHtml(baseUrl);
    const feeds = extractFeedLinks(html, baseUrl);
    if (feeds.length > 0) return feeds[0];
  } catch {
    // page fetch failed, try common paths
  }

  // Probe common feed paths
  for (const feedPath of COMMON_FEED_PATHS) {
    try {
      const feedUrl = new URL(feedPath, baseUrl).href;
      const res = await fetch(feedUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "*/*",
        },
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("xml") || ct.includes("rss") || ct.includes("atom")) {
          const type = ct.includes("atom") ? "atom" as const : "rss" as const;
          return { url: feedUrl, type };
        }
      }
    } catch {
      // skip
    }
  }

  return null;
}
