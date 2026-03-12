import { getDb } from "../db.js";
import { discoverSources } from "./discover.js";
import { findFeeds } from "./feed-finder.js";
import { fetchArticles } from "./fetcher.js";
import { curateDigest } from "./curator.js";
import { concurrent } from "../lib/concurrency.js";
import type { Pipeline, PipelineRunResult } from "../types.js";

/**
 * Run a complete pipeline cycle: discover → find feeds → fetch → curate → store.
 */
export async function runPipeline(pipelineId: string): Promise<PipelineRunResult> {
  const db = getDb();
  const pipeline = db.prepare(
    "SELECT * FROM pipelines WHERE id = ? AND enabled = 1"
  ).get(pipelineId) as Pipeline | undefined;

  if (!pipeline) {
    return {
      pipeline_id: pipelineId,
      sources_discovered: 0,
      articles_fetched: 0,
      digest_id: null,
      snippets_created: 0,
      errors: [`Pipeline ${pipelineId} not found or disabled`],
    };
  }

  const errors: string[] = [];
  let sourcesDiscovered = 0;
  let articlesFetched = 0;
  let digestId: number | null = null;
  let snippetsCreated = 0;

  // Step 1: Discover sources from index page
  try {
    sourcesDiscovered = await discoverSources(pipeline);
  } catch (err) {
    errors.push(`Discovery failed: ${err}`);
  }

  // Step 2: Find RSS feeds for new sources
  try {
    await findFeeds(pipelineId);
  } catch (err) {
    errors.push(`Feed finding failed: ${err}`);
  }

  // Step 3: Fetch new articles
  try {
    articlesFetched = await fetchArticles(pipelineId);
  } catch (err) {
    errors.push(`Fetching failed: ${err}`);
  }

  // Step 4: Curate digest (retry up to 2 times on transient API failure)
  let result = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await curateDigest(pipeline);
      break;
    } catch (err) {
      if (attempt < 3) {
        console.error(`[runner] Curation attempt ${attempt} failed for ${pipelineId}, retrying in 10s: ${err}`);
        await new Promise(r => setTimeout(r, 10_000));
      } else {
        errors.push(`Curation failed after 3 attempts: ${err}`);
      }
    }
  }
  if (result) {
    // Step 5: Store digest and snippets
    const insertDigest = db.prepare(
      "INSERT INTO digests (pipeline_id, title) VALUES (?, ?)"
    );
    const digestResult = insertDigest.run(pipelineId, result.title);
    digestId = digestResult.lastInsertRowid as number;

    const insertSnippet = db.prepare(`
      INSERT INTO snippets (digest_id, key_insight, source_article_id, source_url, source_name, position, is_fresh)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      result!.snippets.forEach((s, i) => {
        insertSnippet.run(
          digestId, s.key_insight,
          s.source_article_id || null, s.source_url, s.source_name, i,
          s.is_fresh === false ? 0 : 1
        );
      });
    });
    tx();

    snippetsCreated = result.snippets.length;
    console.error(`[runner] Created digest #${digestId} with ${snippetsCreated} snippets for ${pipelineId}`);
  }

  return {
    pipeline_id: pipelineId,
    sources_discovered: sourcesDiscovered,
    articles_fetched: articlesFetched,
    digest_id: digestId,
    snippets_created: snippetsCreated,
    errors,
  };
}

/**
 * Run all enabled pipelines.
 */
export async function runAllPipelines(): Promise<PipelineRunResult[]> {
  const db = getDb();
  const pipelines = db.prepare(
    "SELECT id FROM pipelines WHERE enabled = 1"
  ).all() as { id: string }[];

  console.error(`[runner] Starting ${pipelines.length} pipelines (concurrency: 3)`);
  return concurrent<{ id: string }, PipelineRunResult>(pipelines, 3, async (p) => {
    console.error(`[runner] Starting pipeline: ${p.id}`);
    const result = await runPipeline(p.id);
    console.error(`[runner] Completed pipeline: ${p.id} — ${result.snippets_created} snippets, ${result.errors.length} errors`);
    return result;
  });
}
