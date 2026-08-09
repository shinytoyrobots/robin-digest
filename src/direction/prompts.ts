import type { GatheredContext } from "./gatherer.js";
import { VOICE_SPEC_PROFESSIONAL, VOICE_SPEC_FICTION } from "./voice-specs.js";

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
- CROSS-PIPELINE BRIDGING — USE WITH CARE. Bridges MAY cross pipelines, but the connection must be SUBSTANTIVE, not thematic-keyword. For FICTION regular suggestions specifically, prefer external anchors from the FICTION or CULTURE pipelines, where resonance with Robin's fiction is most natural. You may bridge a fiction piece to an AI / PM / design-tech source, but ONLY when the underlying human or thematic substance genuinely coincides — never merely because both mention "systems", "agents", "autonomy", "auditability", or similar shared vocabulary. A forced fiction↔tech link — mapping one of Robin's stories onto an AI/PM concept that only superficially rhymes — is WORSE than no bridge. If the only available external anchor for a fiction suggestion is a thin tech parallel, pick a different angle, or anchor in a fiction/culture-pipeline source instead. (Professional suggestions may range more freely across pipelines.) Apply the SUMMARISE BEFORE CONNECTING test strictly here: if the two one-sentence summaries don't share real substance, drop the bridge.
- SOURCE DIVERSITY. Each regular suggestion should reference a different external source — do not cite the same article or publication twice across suggestions. The digest covers 60+ sources across 6 pipelines; spread your attention.

Today's focus lens (applied to BOTH tracks): "${angle}" — ${ANGLE_DESCRIPTIONS[angle]}

Output ONLY a JSON array with the following items, in this order:
1. Professional regular suggestion #1 (track: "professional", category: writing/learning/project/connection/creative)
2. Professional regular suggestion #2 (track: "professional")
3. Fiction regular suggestion #1 (track: "fiction")
4. Fiction regular suggestion #2 (track: "fiction")
5. Professional engage suggestion (track: "professional", category: "engage")
6. Fiction engage suggestion (track: "fiction", category: "engage")

For the engage suggestions — these are the most important items. Each one MUST produce a PASTE-READY DRAFT COMMENT in the "draft" field, not advice about commenting. The draft is a starting scaffold Robin will edit into his own voice — never final, never auto-posted.

Selection:
- At most one PROFESSIONAL engage (from a non-fiction pipeline: ai-news, ai-thoughts, culture, design-tech, pm-blogs) and at most one FICTION engage (from the fiction pipeline). Never the same article twice.
- ONLY articles published within the last 7 days (check the bracketed date). No stale content.
- Some snippets are marked [RECENTLY RECOMMENDED] (suggested in the last 3 days). Strongly prefer other sources — the digest covers 60+ sites and variety matters.

QUALITY GATE — apply BEFORE drafting; zero beats mediocre:
- THE LETTERS-PAGE BAR: only produce an engage item if the comment would earn a slot on a curated letters page — specific, value-adding, worth a stranger's time. If nothing in a track clears the bar, OMIT that track's engage item. Returning NO engage item is correct and preferred over a weak one (you may return one engage item, or zero).
- ONE draft per item — never a menu of options.
- REJECT a draft that is net-agreement with no added information or tension (sycophancy), OR whose move is to correct/outperform the author rather than extend the conversation (point-scoring). Every comment must carry a delta AND extend the thread.

THE COMMENT RECIPE — every "draft" must:
1. ANCHOR TO A SPECIFIC DETAIL from the piece (quote or name an argument, example, line, or figure). This proves Robin read it. NEVER use generic praise ("Great post", "So true"). If you cannot find a specific anchor, the item fails the gate — omit it.
2. ADD VALUE ONLY ROBIN COULD — a perspective, counter-example, evidence, or experience; be a PEER contributing, not a fan. Where the piece holds a productive internal tension (a claim its own evidence undercuts; two points that pull apart), prefer to NAME THE JUXTAPOSITION AND ASK THE OPEN QUESTION rather than asserting a correction.
3. WRITE FOR THE LURKING READER, not to flatter the author — leave the thread better for the next person who reads it.
4. END WITH AN OPEN HAND — close on an unresolved tension or a genuine question, not a verdict. Do not try to have the last word.
5. Sound like ROBIN. Match the VOICE GUIDE for this track provided in the context below — the Professional guide for professional-track drafts (Field Notes / Signals), the Fiction guide for fiction-track drafts (Shiny Toy Robots / Alternate Frequencies). Honor each guide's "AI Pattern Check": avoid the vocabulary and structural tells it flags. Drop the corporate register entirely.
Keep drafts to 3-5 sentences (briefer for a LinkedIn comment; longer only when complexity genuinely warrants).

TRUST RULES (non-negotiable):
- Lead with value to the author and community. Test: "Would Robin write this if it were never reciprocated?" If no, omit it.
- NO ASK and NO LINK to Robin's work in the draft. No CTA. Link-dropping is forbidden — return traffic comes only from a name and a thought worth following.
- SHOW, DON'T CREDENTIAL: expertise must be inferable from what the comment NOTICES. Never write "As a PM" / "As someone who works in X".
- Where a connection to something Robin has ALREADY written is genuine, the draft may reference that IDEA in passing as a peer's perspective — but must NOT paste a URL or say "check out my piece".

CHANNEL — set the "channel" field:
- [COMMENTABLE] blog/Substack -> "comments": post directly in the comment section.
- [NO COMMENTS], or a point that deserves Robin's own audience -> "linkedin": a short post crediting the author and piece by name, extracting the idea and adding Robin's take.
- brief public mention -> "x"; a point too big for a comment -> "response-post".

FICTION engage: respond AS A WRITER, not an analyst — comment on what resonated, a craft observation, or a thematic echo of Robin's own recent work. Never hunt for an argument to rebut.

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
    "body": "Rationale: the specific value this comment gives the AUTHOR and the OTHER READERS, and why this angle (1-2 sentences)",
    "draft": "The paste-ready comment (3-5 sentences) following the recipe — anchor to a specific detail, add Robin-only value, serve other readers, end on an opening, in Robin's voice. No link, no ask, no credential.",
    "channel": "comments" | "linkedin" | "x" | "response-post",
    "source_refs": ["Article Title|https://example.com/article", "Source Name"],
    "source_url": "URL of the article",
    "category": "engage",
    "track": "professional" | "fiction"
  }
]

No markdown, no preamble, no explanation — just the JSON array.`;

  const parts: string[] = [];

  parts.push("## VOICE GUIDE — Professional track (apply to professional-track engage drafts: Field Notes / Signals)");
  parts.push(VOICE_SPEC_PROFESSIONAL);
  parts.push("\n## VOICE GUIDE — Fiction track (apply to fiction-track engage drafts: Shiny Toy Robots / Alternate Frequencies)");
  parts.push(VOICE_SPEC_FICTION);

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
