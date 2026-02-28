import type { FetchedArticle } from "../types.js";

/**
 * Parse an RSS 2.0 or Atom feed XML string into articles.
 * Uses simple regex parsing to avoid a heavy XML dependency.
 */
export function parseFeed(xml: string, feedType: "rss" | "atom"): FetchedArticle[] {
  if (feedType === "atom") return parseAtom(xml);
  return parseRss(xml);
}

function parseRss(xml: string): FetchedArticle[] {
  const articles: FetchedArticle[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRe.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, "title");
    const link = extractTag(item, "link");
    const author = extractTag(item, "dc:creator") || extractTag(item, "author");
    const pubDate = extractTag(item, "pubDate");
    const description = extractTag(item, "description") || extractTag(item, "content:encoded") || "";

    if (!link) continue;
    const resolvedTitle = title || titleFromUrl(link);

    articles.push({
      url: link,
      title: decodeEntities(resolvedTitle),
      author: author ? decodeEntities(author) : undefined,
      published_at: pubDate ? normalizeDate(pubDate) : undefined,
      content: stripCdata(description),
    });
  }
  return articles;
}

function parseAtom(xml: string): FetchedArticle[] {
  const articles: FetchedArticle[] = [];
  const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRe.exec(xml)) !== null) {
    const entry = match[1];
    const title = extractTag(entry, "title");
    const linkMatch = entry.match(/<link[^>]+href=["']([^"']+)["']/);
    const link = linkMatch?.[1];
    const author = extractTag(entry, "name");
    const published = extractTag(entry, "published") || extractTag(entry, "updated");
    const content = extractTag(entry, "content") || extractTag(entry, "summary") || "";

    if (!link) continue;
    const resolvedTitle = title || titleFromUrl(link);

    articles.push({
      url: link,
      title: decodeEntities(resolvedTitle),
      author: author ? decodeEntities(author) : undefined,
      published_at: published ? normalizeDate(published) : undefined,
      content: stripCdata(content),
    });
  }
  return articles;
}

function titleFromUrl(url: string): string {
  const slug = url.replace(/\/$/, "").split("/").pop() || "untitled";
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function extractTag(xml: string, tag: string): string | null {
  // Match both <tag>content</tag> and <tag ...>content</tag>
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(text: string): string {
  return stripCdata(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeDate(dateStr: string): string {
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return dateStr;
  }
}
