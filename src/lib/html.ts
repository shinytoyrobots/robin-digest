import { config } from "../config.js";

/**
 * Fetch a URL and return the raw HTML.
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

/**
 * Strip HTML tags and decode common entities. Returns plain text.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the main body text of an article page as plain text. Drops page chrome
 * (nav, header, footer, aside, forms) so boilerplate doesn't inflate the word count,
 * then prefers the longest <article>, falling back to <main>, then <body>.
 */
export function extractArticleText(html: string): string {
  const cleaned = html.replace(/<(script|style|noscript|nav|header|footer|aside|form|svg)\b[\s\S]*?<\/\1>/gi, " ");
  const longest = (re: RegExp): string => {
    let best = "";
    for (const m of cleaned.matchAll(re)) {
      const text = stripHtml(m[1]);
      if (text.length > best.length) best = text;
    }
    return best;
  };
  return longest(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)
    || longest(/<main\b[^>]*>([\s\S]*?)<\/main>/gi)
    || longest(/<body\b[^>]*>([\s\S]*?)<\/body>/gi)
    || stripHtml(cleaned);
}

/**
 * Extract all href links from HTML, resolved against a base URL.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], base).href;
      links.push(resolved);
    } catch {
      // skip invalid URLs
    }
  }
  return links;
}

/**
 * Extract RSS/Atom feed URLs from <link rel="alternate"> tags.
 */
export function extractFeedLinks(html: string, baseUrl: string): { url: string; type: "rss" | "atom" }[] {
  const feeds: { url: string; type: "rss" | "atom" }[] = [];
  const base = new URL(baseUrl);
  const re = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    const typeMatch = tag.match(/type=["']([^"']+)["']/);
    const hrefMatch = tag.match(/href=["']([^"']+)["']/);
    if (!typeMatch || !hrefMatch) continue;

    const mimeType = typeMatch[1].toLowerCase();
    if (mimeType.includes("rss") || mimeType.includes("xml")) {
      try {
        feeds.push({ url: new URL(hrefMatch[1], base).href, type: "rss" });
      } catch { /* skip */ }
    } else if (mimeType.includes("atom")) {
      try {
        feeds.push({ url: new URL(hrefMatch[1], base).href, type: "atom" });
      } catch { /* skip */ }
    }
  }
  return feeds;
}
