import { getDb } from "../db.js";
import { fetchHtml, extractLinks } from "../lib/html.js";
import type { Pipeline } from "../types.js";

/**
 * Discover blog sources from a pipeline's index page.
 * Extracts external links that look like blog homepages.
 * Only runs if the pipeline has no sources yet.
 */
export async function discoverSources(pipeline: Pipeline): Promise<number> {
  if (!pipeline.index_url) return 0;

  const db = getDb();
  const existing = db.prepare(
    "SELECT COUNT(*) as count FROM sources WHERE pipeline_id = ?"
  ).get(pipeline.id) as { count: number };

  if (existing.count > 0) return 0;

  console.error(`[discover] Fetching index page: ${pipeline.index_url}`);
  const html = await fetchHtml(pipeline.index_url);
  const links = extractLinks(html, pipeline.index_url);

  // Filter to external links that look like blog homepages
  const indexHost = new URL(pipeline.index_url).hostname;
  const seen = new Set<string>();
  const blogUrls: { url: string; name: string }[] = [];

  for (const link of links) {
    try {
      const u = new URL(link);
      // Skip same-site links, anchor links, common non-blog domains
      if (u.hostname === indexHost) continue;
      if (skipDomains.has(u.hostname)) continue;
      if (u.pathname.length > 1 && u.pathname.split("/").length > 3) continue;

      // Normalize to homepage
      const normalized = `${u.protocol}//${u.hostname}${u.pathname.replace(/\/$/, "")}`;
      if (seen.has(u.hostname)) continue;
      seen.add(u.hostname);

      // Derive a name from the hostname
      const name = u.hostname
        .replace(/^www\./, "")
        .replace(/\.(com|org|net|io|co|blog)$/g, "")
        .replace(/[.-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      blogUrls.push({ url: normalized, name });
    } catch {
      // skip invalid URLs
    }
  }

  const insert = db.prepare(
    "INSERT OR IGNORE INTO sources (pipeline_id, name, url) VALUES (?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const blog of blogUrls) {
      insert.run(pipeline.id, blog.name, blog.url);
    }
  });
  tx();

  console.error(`[discover] Found ${blogUrls.length} sources for ${pipeline.id}`);
  return blogUrls.length;
}

const skipDomains = new Set([
  "twitter.com", "x.com", "facebook.com", "linkedin.com",
  "youtube.com", "instagram.com", "github.com", "reddit.com",
  "amazon.com", "google.com", "apple.com", "microsoft.com",
  "en.wikipedia.org", "t.co",
]);
