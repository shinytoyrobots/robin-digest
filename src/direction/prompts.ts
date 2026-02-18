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
- For source_refs: if the source is external (a digest snippet, blog post, or article — NOT Robin's own writings, notes, or vault), format it as "description|URL" so it can be linked. Robin's own content should be plain text with no URL.

Today's focus lens: "${angle}" — ${ANGLE_DESCRIPTIONS[angle]}

Output ONLY a JSON array with this structure. The first 2-3 items are your regular suggestions. The FINAL 2 items should be "engage" suggestions — specific articles from the digest snippets that Robin should comment on, reply to, or engage with. Pick articles where Robin's perspective would add the most value to the conversation.

For the engage suggestions:
- Pick 2 DIFFERENT articles. Do not suggest the same article twice.
- ONLY pick articles published within the last 7 days. Check the date shown in brackets. Do NOT pick old articles — engagement on stale content has low value.
- STRONGLY prefer articles marked [COMMENTABLE] — these have comment sections where Robin can reply directly.
- If you pick a [COMMENTABLE] article, suggest replying in the comments.
- If no [COMMENTABLE] article is a good fit and you pick a [NO COMMENTS] article, suggest engaging via LinkedIn or X instead, and note this in the body.
- If only 1 article from the last 7 days is worth engaging with, include just 1 engage item.
- If no articles from the last 7 days are worth engaging with, omit engage suggestions entirely.

[
  {
    "title": "Short imperative title",
    "body": "2-3 sentence explanation with specific references",
    "source_refs": ["what sources/data informed this"],
    "category": "writing" | "learning" | "project" | "connection" | "creative"
  },
  {
    "title": "Reply to [article title]",
    "body": "Why this article deserves Robin's engagement and what angle to take",
    "source_refs": ["article title", "source name"],
    "source_url": "URL of the article",
    "category": "engage"
  },
  {
    "title": "Reply to [different article title]",
    "body": "Why this article deserves Robin's engagement and what angle to take",
    "source_refs": ["article title", "source name"],
    "source_url": "URL of the article",
    "category": "engage"
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
      const tag = s.commentable ? "[COMMENTABLE]" : "[NO COMMENTS]";
      const dateStr = s.published_at ? s.published_at.slice(0, 10) : "unknown date";
      parts.push(`- ${tag} [${dateStr}] "${s.insight}" — ${s.source} (${s.source_url})`);
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
