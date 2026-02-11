import type { GatheredContext } from "./gatherer.js";

export const FOCUS_ANGLES = [
  "creative-writing",
  "learning",
  "project-momentum",
  "unexpected-connection",
  "reflection",
  "outreach",
] as const;

export type FocusAngle = (typeof FOCUS_ANGLES)[number];

const ANGLE_DESCRIPTIONS: Record<FocusAngle, string> = {
  "creative-writing": "Fiction, essays, blog posts — continuing threads in Static Drift, Alternate Frequencies, or starting something new.",
  "learning": "New skills, articles to read deeply, concepts to explore, technical rabbit holes worth going down.",
  "project-momentum": "Pick a specific project and suggest a concrete next step to move it forward today.",
  "unexpected-connection": "Find a surprising link between two unrelated things Robin has been working on or reading about.",
  "reflection": "Revisit something older — a past writing, a bookmarked article, a shelved idea — with fresh eyes.",
  "outreach": "Share something, connect with someone, publish a draft, contribute to a conversation.",
};

export function pickRandomAngle(): FocusAngle {
  return FOCUS_ANGLES[Math.floor(Math.random() * FOCUS_ANGLES.length)];
}

export function buildPrompt(context: GatheredContext, angle: FocusAngle): { system: string; user: string } {
  const system = `You are generating daily suggestions for Robin Cannon — a product manager, writer, and technologist.

Your job is to produce 2-3 specific, actionable suggestions for Robin's day. These should NOT be generic productivity advice. They should reference actual projects, writings, sources, and interests from the context provided.

Key principles:
- Be SPECIFIC. Name actual projects, articles, people, and ideas.
- Be NON-DETERMINISTIC. Surprise Robin. Make lateral connections he wouldn't expect.
- Be ACTIONABLE. Each suggestion should be something Robin could do today.
- Be BRIEF. 2-3 sentences per suggestion, no more.
- Reference SOURCES. Note which context data informed each suggestion.

Today's focus lens: "${angle}" — ${ANGLE_DESCRIPTIONS[angle]}

Output ONLY a JSON array of 2-3 suggestion objects with this structure:
[
  {
    "title": "Short imperative title",
    "body": "2-3 sentence explanation with specific references",
    "source_refs": ["what sources/data informed this"],
    "category": "writing" | "learning" | "project" | "connection" | "creative"
  }
]

No markdown, no preamble, no explanation — just the JSON array.`;

  const parts: string[] = [];

  if (context.recentWritings.length > 0) {
    parts.push("## Recent writings on robin-cannon.com");
    for (const w of context.recentWritings) {
      parts.push(`- ${w.title} (${w.url})`);
    }
  }

  if (context.recentDigestSnippets.length > 0) {
    parts.push("\n## Recent digest snippets (curated this week)");
    for (const s of context.recentDigestSnippets) {
      parts.push(`- "${s.insight}" — ${s.source}`);
    }
  }

  if (context.recentToolUsage.length > 0) {
    parts.push("\n## Recent robin-mcp tool usage (what Robin's been working on)");
    for (const t of context.recentToolUsage) {
      parts.push(`- ${t.tool}: ${t.calls} calls`);
    }
  }

  if (context.activeContexts.length > 0) {
    parts.push("\n## Active contexts/sources in robin-mcp");
    parts.push(context.activeContexts.join(", "));
  }

  if (context.recentFeedback.length > 0) {
    parts.push("\n## Recent feedback on past suggestions");
    for (const f of context.recentFeedback) {
      let line = `- "${f.suggestion_title}" → ${f.reaction}`;
      if (f.note) line += ` (note: "${f.note}")`;
      parts.push(line);
    }
    parts.push("\nUse this feedback: lean into what was marked 'useful' or 'inspired', avoid patterns similar to 'not_relevant'.");
  }

  const user = parts.length > 0
    ? `Here is today's context for generating suggestions:\n\n${parts.join("\n")}\n\nGenerate 2-3 suggestions with today's focus: "${angle}".`
    : `Generate 2-3 suggestions for Robin's day with focus: "${angle}". No specific context is available today, so draw on general knowledge of Robin as a PM/writer/technologist.`;

  return { system, user };
}
