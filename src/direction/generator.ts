import { getDb } from "../db.js";
import { generateTextWithUsage } from "../lib/claude.js";
import { config } from "../config.js";
import { gatherContext } from "./gatherer.js";
import { pickRandomAngle, buildPrompt } from "./prompts.js";

export interface Suggestion {
  title: string;
  body: string;
  source_refs: string[];
  source_url?: string;
  category: string;
}

function parseResponse(raw: string): Suggestion[] {
  // Extract JSON array from response — handle markdown code fences
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Response is not an array");

  return parsed.map((item: Record<string, unknown>) => ({
    title: String(item.title || "Untitled"),
    body: String(item.body || ""),
    source_refs: Array.isArray(item.source_refs) ? item.source_refs.map(String) : [],
    source_url: item.source_url ? String(item.source_url) : undefined,
    category: String(item.category || "creative"),
  }));
}

export async function generateDailyDirection(): Promise<number> {
  const context = await gatherContext();
  const angle = pickRandomAngle();
  const { system, user } = buildPrompt(context, angle);

  const callOptions = { temperature: 0.9, model: config.directionModel };
  let inputTokens = 0;
  let outputTokens = 0;

  let raw: string;
  try {
    const result = await generateTextWithUsage(user, system, callOptions);
    raw = result.text;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (err) {
    console.error("[direction] Claude API error:", err);
    throw err;
  }

  let suggestions: Suggestion[];
  try {
    suggestions = parseResponse(raw);
  } catch {
    // Retry once on parse failure
    console.error("[direction] Parse failed, retrying...");
    try {
      const result = await generateTextWithUsage(user, system, callOptions);
      raw = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      suggestions = parseResponse(raw);
    } catch {
      // Store raw text as a single fallback suggestion
      console.error("[direction] Parse failed again, storing raw text");
      suggestions = [{ title: "Daily Direction", body: raw.slice(0, 500), source_refs: [], category: "creative" }];
    }
  }

  const contextSummary = [
    context.recentWritings.length > 0 ? `${context.recentWritings.length} writings` : null,
    context.recentDigestSnippets.length > 0 ? `${context.recentDigestSnippets.length} snippets` : null,
    context.recentToolUsage.length > 0 ? `${context.recentToolUsage.length} tools` : null,
    context.recentFeedback.length > 0 ? `${context.recentFeedback.length} feedback items` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO daily_directions (focus_angle, suggestions, context_summary, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)"
    )
    .run(angle, JSON.stringify(suggestions), contextSummary || null, inputTokens || null, outputTokens || null);

  const id = Number(result.lastInsertRowid);
  console.error(`[direction] Generated direction #${id} (angle: ${angle}, ${suggestions.length} suggestions, ${inputTokens}in/${outputTokens}out tokens)`);
  return id;
}
