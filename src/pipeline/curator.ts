import { getDb } from "../db.js";
import { generateText } from "../lib/claude.js";
import type { Pipeline, Article, CuratedSnippet } from "../types.js";

/**
 * Curate articles into key insights using Claude.
 * Each insight is one sentence distilled from one article.
 * If an article can't be reduced to a clear insight, it's skipped.
 * Prioritizes articles published since the last digest run.
 */
export async function curateDigest(
  pipeline: Pipeline
): Promise<{ title: string; snippets: CuratedSnippet[] } | null> {
  const db = getDb();

  // Find when the last digest was created for this pipeline
  const lastDigest = db.prepare(
    `SELECT created_at FROM digests WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT 1`
  ).get(pipeline.id) as { created_at: string } | undefined;
  const lastRunAt = lastDigest?.created_at ?? null;

  // Get the latest unfeatured article per source, from the last 5 days
  const articles = db.prepare(`
    WITH latest_per_source AS (
      SELECT a.id,
             ROW_NUMBER() OVER (PARTITION BY a.source_id ORDER BY COALESCE(a.published_at, a.fetched_at) DESC) AS rn
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE s.pipeline_id = ?
        AND a.fetched_at > datetime('now', '-5 days')
        AND a.id NOT IN (SELECT source_article_id FROM snippets WHERE source_article_id IS NOT NULL)
    )
    SELECT a.*, s.name as source_name
    FROM articles a
    JOIN sources s ON a.source_id = s.id
    JOIN latest_per_source lps ON a.id = lps.id AND lps.rn = 1
    ORDER BY a.fetched_at DESC
    LIMIT 20
  `).all(pipeline.id) as (Article & { source_name: string })[];

  if (articles.length === 0) {
    console.error(`[curator] No new articles to curate for ${pipeline.id}`);
    return null;
  }

  // Tag articles as fresh (published since last run) or from archive
  const taggedArticles = articles.map(a => ({
    ...a,
    is_fresh: lastRunAt ? (a.published_at ?? a.fetched_at) > lastRunAt : true,
  }));

  const freshCount = taggedArticles.filter(a => a.is_fresh).length;
  const archiveCount = taggedArticles.length - freshCount;
  console.error(`[curator] Curating ${taggedArticles.length} articles for ${pipeline.id} (${freshCount} fresh, ${archiveCount} archive)`);

  const articleList = taggedArticles.map((a, i) => (
    `[${i + 1}] ${a.is_fresh ? "[NEW]" : "[ARCHIVE]"} "${a.title}" — ${a.source_name}\n` +
    `URL: ${a.url}\n` +
    `Content: ${a.content.slice(0, 1000)}\n`
  )).join("\n---\n");

  const userPrompt = `Here are the recent articles to curate:\n\n${articleList}\n\n` +
    `Select up to ${pipeline.max_snippets} articles worth keeping. For each, distill ONE key insight sentence.\n` +
    `Rules:\n` +
    `- One article per source (blog). Maximize source diversity.\n` +
    `- Prefer articles marked [NEW] over [ARCHIVE] when quality is similar, but don't skip good [ARCHIVE] content — archive articles are still unpublished in this digest.\n` +
    `- If you can't distill a clear, actionable insight from an article, skip it entirely.\n` +
    `- Each key_insight must be a single sentence — specific and self-contained.\n` +
    `- If an article is verse poetry (stanzas, line breaks as deliberate formal structure — not prose paragraphs), write a descriptive insight beginning with "A poem that". Do not invent a thesis it doesn't make.\n` +
    `- If an article is prose fiction (a short story, flash fiction, or narrative with characters and plot), write a descriptive insight beginning with "A short story that" or "A piece of flash fiction that". Do not treat it as analytical argument, and do not call it a poem.\n` +
    `- In your response, set "is_fresh" to true for [NEW] articles and false for [ARCHIVE] articles.\n\n` +
    `Respond in this exact JSON format:\n` +
    `{\n` +
    `  "title": "Short digest title",\n` +
    `  "insights": [\n` +
    `    { "article_number": 1, "key_insight": "One sentence insight.", "is_fresh": true }\n` +
    `  ]\n` +
    `}`;

  const response = await generateText(userPrompt, pipeline.curation_prompt);

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[curator] Failed to parse JSON from Claude response`);
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      title: string;
      insights: { article_number: number; key_insight: string; is_fresh?: boolean }[];
    };

    // Enforce one snippet per source
    const seenSources = new Set<string>();
    const snippets: CuratedSnippet[] = [];
    for (const s of parsed.insights) {
      const article = taggedArticles[s.article_number - 1];
      if (!article) continue;
      const sourceName = article.source_name;
      if (seenSources.has(sourceName)) continue;
      seenSources.add(sourceName);
      snippets.push({
        key_insight: s.key_insight,
        source_url: article.url,
        source_name: sourceName,
        source_article_id: article.id,
        is_fresh: article.is_fresh,
      });
    }

    return { title: parsed.title, snippets };
  } catch (err) {
    console.error(`[curator] JSON parse error: ${err}`);
    return null;
  }
}
