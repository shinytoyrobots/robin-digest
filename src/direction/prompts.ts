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
  "reflection": "Revisit something older — a past writing, a shelved idea — but through the lens of something recently read. What does the new material illuminate about the old work, or vice versa?",
  "outreach": "Share something, connect with someone, publish a draft, contribute to a conversation.",
};

export function pickRandomAngle(): FocusAngle {
  return FOCUS_ANGLES[Math.floor(Math.random() * FOCUS_ANGLES.length)];
}

export function buildPrompt(context: GatheredContext, angle: FocusAngle): { system: string; user: string } {
  const system = `You are generating daily suggestions for Robin Cannon — a product manager, writer, and technologist.

Robin's writing splits into two tracks that he wants kept distinct:
- PROFESSIONAL — Signals (newsletter) + Field Notes (essays). PM, product, design systems, AI tooling, technology, culture-of-work. Sources: pm-blogs, design-tech, ai-news, ai-thoughts, culture pipelines.
- FICTION — Shiny Toy Robots (sci-fi/cyberpunk world Static Drift) + Alternate Frequencies (poetry, flash, shorts). Sources: fiction pipeline.

Your job is to produce a full day's direction split across BOTH tracks. Each track gets its own regular suggestions and its own engage suggestion. These should NOT be generic productivity advice. They should reference actual projects, writings, sources, and interests from the context provided.

Key principles:
- Be SPECIFIC. Name actual projects, articles, people, and ideas.
- Be NON-DETERMINISTIC. Surprise Robin. Make lateral connections he wouldn't expect.
- Be ACTIONABLE. Each suggestion should be something Robin could do today.
- Be BRIEF. 2-3 sentences per suggestion, no more.
- Reference SOURCES. Note which context data informed each suggestion.
- For source_refs: IMPORTANT — external sources (digest snippets, blog posts, articles) MUST use the format "description|URL" (e.g. "Article Title|https://example.com/article") so they render as clickable links. Robin's own writings/notes should be plain text with no URL. The URL is available in the context data — always include it.
- SUMMARISE BEFORE CONNECTING. Before proposing any connection between an external source and Robin's work or frameworks, internally ask: what is this source actually arguing (in one sentence)? What is Robin's work actually arguing (in one sentence)? Only propose the connection if those two summaries share substance — not just vocabulary. Discard matches that rely on shared words with different meanings.
- INTERNAL vs EXTERNAL. Robin's own writings and vault pieces (marked [INTERNAL] in the context) are internal material — his own thinking, fiction, and essays. Digest snippets are external material — what he has been reading. These are distinct and should be treated as such.
- CONNECT OUTWARD. Regular suggestions (non-engage) must bridge internal and external: take something from Robin's own work or vault and connect it to at least one external source from the digest, or vice versa. A suggestion that only references internal material with no external anchor is incomplete. A suggestion that only references external material with no internal hook misses the point. The engage suggestions handle direct outreach — regular suggestions handle the quieter work of letting external ideas fertilise Robin's own work and thinking.
- TRACK COHERENCE. The "track" field describes which of Robin's output streams the suggestion advances — not where the external source must come from. A "professional" suggestion lands in Signals or Field Notes; a "fiction" suggestion lands in Shiny Toy Robots, Alternate Frequencies, or Static Drift world-building. The INTERNAL anchor (Robin's own writing or vault material) determines the track: if the internal anchor is fiction, the suggestion is fiction; if it's non-fiction, the suggestion is professional.
- CROSS-PIPELINE BISOCIATION IS ENCOURAGED. The EXTERNAL anchor can come from ANY pipeline — fiction, pm-blogs, design-tech, ai-news, ai-thoughts, or culture. A Lenny's PM essay can spark a Static Drift scene; a fiction-pipeline poem can inform a Field Notes essay on craft. The richest suggestions often cross domains. Do NOT confine fiction suggestions to fiction-pipeline external sources — that starves the fiction track of external material and pushes it toward purely internal references, which violates the CONNECT OUTWARD rule above.
- SOURCE DIVERSITY. Each regular suggestion should reference a different external source — do not cite the same article or publication twice across suggestions. The digest covers 60+ sources across 6 pipelines; spread your attention.

Today's focus lens (applied to BOTH tracks): "${angle}" — ${ANGLE_DESCRIPTIONS[angle]}

Output ONLY a JSON array with the following items, in this order:
1. Professional regular suggestion #1 (track: "professional", category: writing/learning/project/connection/creative)
2. Professional regular suggestion #2 (track: "professional")
3. Fiction regular suggestion #1 (track: "fiction")
4. Fiction regular suggestion #2 (track: "fiction")
5. Professional engage suggestion (track: "professional", category: "engage")
6. Fiction engage suggestion (track: "fiction", category: "engage")

For the engage suggestions:
- Pick 2 DIFFERENT articles. Do not suggest the same article twice.
- ONLY pick articles published within the last 7 days. Check the date shown in brackets. Do NOT pick old articles — engagement on stale content has low value.
- The PROFESSIONAL engage must come from a non-fiction pipeline (ai-news, ai-thoughts, culture, design-tech, pm-blogs).
- The FICTION engage must come from the fiction pipeline.
- Engagement is not limited to replying in a comment section. It can also mean writing a response article, citing the piece in a LinkedIn post or thread, or responding publicly on X. Choose the form that best fits the content and the point Robin would make.
- For [COMMENTABLE] articles, replying in the comments is the most direct option — suggest it.
- For [NO COMMENTS] articles, suggest the most appropriate alternative: LinkedIn citation, a response post, or a public mention on X.
- If no article from the last 7 days is worth engaging with in a given track, OMIT that track's engage item entirely (return one engage instead of two, or zero).
- For fiction snippets (insight begins with "A poem that", "A short story that", "A piece of flash fiction that"): frame the engagement as a writer, not an analyst. Comment on what resonated, a craft observation, or a thematic connection to Robin's own recent work (use Robin's recent writings in context). Do not look for an argument to rebut.
- VARIETY: Some snippets are marked [RECENTLY RECOMMENDED]. These sources were suggested for engagement within the last 3 days. Strongly prefer other sources — the digest covers 60+ sites and variety matters. Only pick a [RECENTLY RECOMMENDED] source if it is genuinely exceptional and no other good candidate exists from the last 7 days.

Every item MUST include a "track" field set to either "professional" or "fiction".

[
  {
    "title": "Short imperative title",
    "body": "2-3 sentence explanation with specific references",
    "source_refs": ["Article Title|https://example.com/article", "Robin's own writing (no URL)"],
    "category": "writing" | "learning" | "project" | "connection" | "creative",
    "track": "professional" | "fiction"
  },
  {
    "title": "Reply to [article title]",
    "body": "Why this article deserves Robin's engagement and what angle to take",
    "source_refs": ["Article Title|https://example.com/article", "Source Name"],
    "source_url": "URL of the article",
    "category": "engage",
    "track": "professional" | "fiction"
  }
]

No markdown, no preamble, no explanation — just the JSON array.`;

  const parts: string[] = [];

  if (context.recentWritings.length > 0) {
    const isVault = (w: { url: string }) => w.url.startsWith("vault:");
    const fiction = context.recentWritings.filter((w) => w.category === "fiction");
    const nonFiction = context.recentWritings.filter((w) => w.category === "non-fiction");

    const publishedNonFiction = nonFiction.filter((w) => !isVault(w));
    const vaultNonFiction = nonFiction.filter(isVault);
    const publishedFiction = fiction.filter((w) => !isVault(w));
    const vaultFiction = fiction.filter(isVault);

    if (publishedNonFiction.length > 0) {
      parts.push("## [INTERNAL] Recently published non-fiction (robin-cannon.com)");
      for (const w of publishedNonFiction) {
        parts.push(`### ${w.title}\n${w.url}\n\n${w.excerpt}`);
      }
    }
    if (vaultNonFiction.length > 0) {
      parts.push("\n## [INTERNAL] Non-fiction vault (previously published essays — already out in the world, do NOT suggest publishing)");
      for (const w of vaultNonFiction) {
        parts.push(`### ${w.title}\n\n${w.excerpt}`);
      }
    }
    if (publishedFiction.length > 0) {
      parts.push("\n## [INTERNAL] Recently published fiction (robin-cannon.com)");
      for (const w of publishedFiction) {
        parts.push(`### ${w.title}\n${w.url}\n\n${w.excerpt}`);
      }
    }
    if (vaultFiction.length > 0) {
      parts.push("\n## [INTERNAL] Fiction vault (previously published shorts, flash fiction, world-building — already out in the world, do NOT suggest publishing)");
      for (const w of vaultFiction) {
        parts.push(`### ${w.title}\n\n${w.excerpt}`);
      }
    }
  }

  if (context.missionStatement && context.recentWritings.some((w) => w.category === "fiction")) {
    parts.push("\n## Static Drift — Mission Statement (fiction project bible)");
    parts.push(context.missionStatement);
  }

  if (context.recentDigestSnippets.length > 0) {
    parts.push("\n## Recent digest snippets (curated this week)");
    for (const s of context.recentDigestSnippets) {
      const commentTag = s.commentable ? "[COMMENTABLE]" : "[NO COMMENTS]";
      const dateStr = s.published_at ? s.published_at.slice(0, 10) : "unknown date";
      let recentTag = "";
      try {
        const host = new URL(s.source_url).hostname.replace(/^www\./, "");
        if (context.recentlyRecommendedHosts.has(host)) {
          recentTag = " [RECENTLY RECOMMENDED]";
        }
      } catch {
        // malformed URL — skip tag
      }
      parts.push(`- ${commentTag}${recentTag} [${dateStr}] [${s.pipeline_id}] "${s.insight}" — ${s.source} (${s.source_url})`);
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
