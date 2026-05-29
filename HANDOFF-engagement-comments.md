# HANDOFF: Trust-Building Engagement Comments

## Intent

Upgrade the **engage** suggestions in the daily direction so that, for each qualifying digest item, the system produces a *trust-building outreach comment* that:

- engages positively with the **author** of the piece, AND
- adds genuine value to that piece's **other readers** (and, for LinkedIn citations, to Robin's network),
- builds a **sense of trust and credibility** in Robin's responses,
- and — as a **welcome side-effect, never the goal** — makes Robin's name worth clicking, encouraging return traffic to robin-cannon.com.

This is the cheapest, highest-leverage slice of the engagement work in `~/Documents/knowledge-vault/Notes/Reference/Invention-Skills/2026-05-28-digest-engagement-actionability/invent.md` (concepts M1 "draft, don't advise", AD2 "platform-adaptive", T2 "own-work as peer signal", Reversal "reciprocity-first"). It is grounded in `research/2026-05-28-online-engagement-commenting/research-output.md`, and further sharpened by the collision in `~/Documents/knowledge-vault/Notes/Reference/Invention-Skills/2026-05-28-engagement-comments-private-eye-plato/collide.md` (Private Eye Letters × Plato's Dialogues), which contributed the Quality Gate, the Lurker's Take, the Elenchus Move, the Open Hand, and Show-don't-credential.

**Scope of v1: prompt-first.** No DB schema change. Touches 3 files: `src/direction/prompts.ts`, `src/direction/generator.ts`, `src/ui/direction.html.ts`. The stateful "Inner Circle / relationship ladder" ideas are explicitly **deferred to v2** (see end).

---

## The shift in one line

Today the engage card gives **advice about engaging** ("Reply to X, take this angle"). v1 makes it deliver a **paste-ready draft comment** plus a short rationale — so the action is "edit and post," not "now go figure out what to say."

---

## The comment recipe (the core of v1)

Every drafted comment follows the research's single-comment recipe, extended with the dual-audience requirement the user asked for and the discourse mechanics from the Private Eye × Plato collision:

1. **Anchor to a specific detail** (*Proof of Presence*) — quote or name a particular argument, example, line, or figure from the piece. This proves Robin actually read it (specificity is *the* universal authenticity signal). Generic praise ("Great post!") is banned. **If the draft cannot anchor to a genuinely specific detail, it has failed the gate — omit it** rather than reaching for a generic hook.
2. **Add value only Robin could** — a perspective, a counter-example, a piece of evidence, a connection to his own work/experience. This is what makes him *seen as a peer, not a fan*. Where the piece holds a **productive internal tension** (an intro claim the body quietly undercuts; two reasonable points that pull apart), prefer the **Elenchus Move**: name the juxtaposition and ask the open question — let the author and readers do the closing move — rather than asserting a correction.
3. **Write for the lurking reader** (*The Lurker's Take*) — the published comment is staged for the silent thread audience, not to flatter the author (the author is the foil; credibility radiates outward). Self-check before finalizing: *"What does a lurking reader gain from this comment?"* If the honest answer is "nothing they couldn't get from the article," the draft fails.
4. **End with an open hand** (*Productive Aporia*) — close on an opening, not a verdict: an unresolved tension or a genuine question the article didn't ask. Decline the last word — a comment that invites reply has more thread influence than one that closes it. (This replaces the old "optional question" step; the open close is now the default.)
5. **Write the way Robin speaks** — drop the corporate register; it reads as insincere and increasingly as AI-generated.

The drafted comment is always a **starting draft to edit in Robin's voice**, never auto-posted. (AI-generic comments fail precisely because they lack the specificity that signals real engagement.)

**Automation ceiling (hard constraint).** The engine stays at **advice/angle → ready-to-edit scaffold** and goes *no further* — no auto-pulled quotes as content beyond the specific anchor, and never auto-post. The published comment must be **primarily Robin's own voice**; the draft is a scaffold he rewrites, not a paste-and-post. Where a draft would only ever read as AI boilerplate, prefer to give the **angle/advice** and let Robin write it. (This rules out morph configs above ready-to-edit; see `…/2026-05-28-engagement-comment-engine/morph.md`.)

---

## The Quality Gate (zero beats mediocre)

From the collision's *Scarcity-as-Quality-Filter* (Private Eye's single print slot; Plato's one-precise-question-per-move) and the *Two Trip-Wires* (Plato's named failure modes):

- **The Letters-Page Bar.** Each engage item must clear the bar of *"would this earn a slot on a curated letters page?"* — specific, value-adding, worth a stranger's time. **It is better to return no engage item for a track than a mediocre one.** Restraint is itself the trust signal; in an era of AI-slop comments, not-posting is a differentiator.
- **One draft, not a menu.** Produce a single best comment per worthy item — never a list of variants for Robin to pick from. Offering options offloads the quality judgment and degrades the discipline; the engine should pass its own editor's eye first.
- **Trip-wire A — sycophancy.** Reject any draft that is **net-agreement with no added information or tension**. Every comment must carry a *delta*.
- **Trip-wire B — eristic.** Reject any draft whose move is to **correct or outperform the author** rather than extend the conversation. Point-scoring reads as ego in front of the watching audience and destroys trust. Aim to extend, not to win.

---

## Trust principles baked into the prompt

From the research, stated as hard rules for the model:

- **Reciprocity-first.** Lead with value *to the author and the community*. The diagnostic: *"Would Robin write this if it were never reciprocated?"* If no, don't suggest it.
- **No ask, no link-drop.** The comment contains **no request and no link to Robin's work**. Return traffic, if any, comes only from a name and a thought worth following — never from a CTA. Link-dropping is the cardinal black-hat error.
- **Show, don't credential** (*the Pseudonymous Insider*). Expertise must be **inferable from what the comment notices**, never stated. Ban credential-prefaces ("As a PM / design-systems lead, I…"). The precision of the observation *is* the credential — Socrates' ironic ignorance and Private Eye's "A Concerned GP" both signal authority through the move, not a byline.
- **Own-work as peer signal, woven not pasted.** Where a tracked connection to something Robin has *already written* is genuine, the comment may *reference the idea* in passing (as a peer contributing a perspective) — but **must not paste a URL or say "check out my piece."** The reference earns the click; it does not solicit it.
- **Be seen as a peer, not liked.** The goal is a substantive contribution that breaks the parasocial default, not appreciation-performance.

---

## Platform adaptation (replaces today's uniform guidance)

The comment's form and norms depend on where it lands:

- **Blog / Substack comment section** ([COMMENTABLE]): post directly in the comments. Substantive, specific, conversational. Soft presence; can reply to other commenters too.
- **LinkedIn citation post** (for [NO COMMENTS] non-fiction, or when the point deserves Robin's own audience): a short post that credits the author + piece by name, extracts the idea, and adds Robin's take. Credits generously; the author is tagged where appropriate. This is the "engage the broader readers" surface.
- **X / public mention**: brief, specific, credits the piece.
- **Response article**: only when the point is too big for a comment.

For **fiction-pipeline** snippets: engage **as a writer, not an analyst** — comment on what resonated, a craft observation, or a thematic echo of Robin's own recent work. Never look for an argument to rebut. (Carry this rule forward from the current prompt.)

> Note for future LinkedIn/decentralized expansion: the research warns that LinkedIn/Substack tactics backfire on HN/Reddit/Mastodon/Bluesky (lurk first, lead with substance, zero self-promo; literary Bluesky = amplify peers before surfacing your own work). v1 only covers blog/Substack/LinkedIn/X, which is what the digest currently feeds. Flag for v2 if those platforms enter scope.

---

## New engage-card output shape

Extend the engage JSON item with two fields (`draft`, `channel`); repurpose `body` as the rationale:

```jsonc
{
  "title": "Reply to [article title]",
  "body": "Rationale: the specific value this comment gives the AUTHOR and the OTHER READERS, and why this angle (1-2 sentences).",
  "draft": "The paste-ready comment (3-5 sentences) following the recipe — acknowledge a specific detail, add Robin-only value, serve other readers, in Robin's voice. No link, no ask.",
  "channel": "comments" | "linkedin" | "x" | "response-post",
  "source_refs": ["Article Title|https://example.com/article", "Source Name"],
  "source_url": "URL of the article",
  "category": "engage",
  "track": "professional" | "fiction"
}
```

Everything else about engage-item selection stays as-is for v1 (last-7-days window, professional-from-non-fiction / fiction-from-fiction, omit if nothing worthy, the [RECENTLY RECOMMENDED] variety nudge).

---

## Proposed prompt text (drop-in replacement for `prompts.ts` lines 60–90)

```
For the engage suggestions — these are the most important items. Each one must produce a
PASTE-READY DRAFT COMMENT, not advice about commenting.

Selection:
- Up to one PROFESSIONAL engage (a non-fiction pipeline: ai-news, ai-thoughts, culture, design-tech,
  pm-blogs) and up to one FICTION engage (the fiction pipeline). Never the same article twice.
- ONLY articles published within the last 7 days (check the bracketed date). No stale content.
- Some snippets are [RECENTLY RECOMMENDED] (suggested in the last 3 days). Strongly prefer others.

THE QUALITY GATE — apply BEFORE drafting; zero beats mediocre:
- THE LETTERS-PAGE BAR: only produce an engage item if the comment would earn a slot on a curated
  letters page — specific, value-adding, worth a stranger's time. If nothing in a track clears the
  bar, OMIT that track's engage item. Returning NO comment is correct and preferred over a weak one.
- ONE draft per item, never a menu of options.
- REJECT a draft if it is net-agreement with no added information or tension (sycophancy), OR if its
  move is to correct/outperform the author rather than extend the conversation (point-scoring). Every
  comment must carry a delta AND extend the thread.

THE COMMENT RECIPE — every draft must:
1. ANCHOR TO A SPECIFIC DETAIL from the piece (quote or name an argument, example, line, or figure).
   This proves Robin read it. NEVER use generic praise ("Great post", "So true"). If you cannot find a
   specific anchor, the item fails the gate — omit it.
2. ADD VALUE ONLY ROBIN COULD — a perspective, counter-example, evidence, or experience; be seen as a
   PEER contributing, not a fan. Where the piece has a productive internal tension (a claim its own
   evidence undercuts; two points that pull apart), prefer to NAME THE JUXTAPOSITION AND ASK THE OPEN
   QUESTION — let the author/readers close it — rather than asserting a correction.
3. WRITE FOR THE LURKING READER, not to flatter the author (the author is the foil; credibility
   radiates to the silent thread audience). Self-check: "What does a lurking reader gain here?" If
   nothing they couldn't get from the article, the draft fails.
4. END WITH AN OPEN HAND — close on an unresolved tension or a genuine question, not a verdict. Do not
   try to have the last word; a comment that invites reply has more influence than one that closes it.
5. Sound like Robin speaking. Drop the corporate register; it reads as insincere / AI-generated.
Keep drafts to 3-5 sentences (briefer for LinkedIn comments; longer only when complexity warrants).

TRUST RULES (non-negotiable):
- Lead with value to the author and community. Test: "Would Robin write this if it were never
  reciprocated?" If no, don't suggest it.
- NO ASK and NO LINK to Robin's work in the comment. Return traffic comes only from a name and a
  thought worth following — never a CTA. Link-dropping is forbidden.
- SHOW, DON'T CREDENTIAL: expertise must be inferable from what the comment NOTICES. Never write "As a
  PM / as someone who works in X..." — the precision of the observation is the credential.
- Where a connection to something Robin has ALREADY written is genuine, the draft may reference that
  IDEA in passing as a peer's perspective — but must NOT paste a URL or say "check out my piece."

CHANNEL (set the "channel" field):
- [COMMENTABLE] blog/Substack -> "comments": post directly; substantive and conversational.
- [NO COMMENTS], or a point deserving Robin's own audience -> "linkedin": a short post crediting the
  author and piece by name, extracting the idea, adding Robin's take (engages the broader readers).
- brief public mention -> "x"; a point too big for a comment -> "response-post".

FICTION engage: respond AS A WRITER, not an analyst. Comment on what resonated, a craft observation,
or a thematic echo of Robin's own recent work. Never hunt for an argument to rebut.
```

Then update the JSON example block to the new shape shown above.

---

## Code touch points (v1)

1. **`src/direction/prompts.ts`** — replace the engage instructions + JSON example (above). Add the trust rules to the system prompt's "Key principles" if reinforcement helps.
2. **`src/direction/generator.ts`** — add `draft?: string` and `channel?: string` to the `Suggestion` interface; parse both in `parseResponse` (alongside the existing `source_url`).
3. **`src/ui/direction.html.ts`** — in the engage card, render `draft` in a distinct, readable block (monospace or quoted), ideally with a one-click **Copy** button; show `channel` as a small label (e.g. "→ comment", "→ LinkedIn"). `body` stays as the rationale line.

No migration. `daily_directions.suggestions` is already free-form JSON, so the new fields persist automatically.

---

## Deferred to v2 (save for later)

These come straight from the invent.md but are bigger builds; do NOT do them in v1:
- **Inner Circle + relationship ladder** (track ~5–10 writers; suggest the *next rung* per writer; needs a `relationship_ledger` table). The collision's *Running Correspondent* isomorphism independently re-derived this — recurring correspondents (Private Eye) and the recognizable Socratic method across dialogues both show that a comment's weight compounds with the track record behind it. Robin's comment history should eventually be treated as a *corpus with a credit score*, not a fresh start per article. Strong signal this belongs on the roadmap.
- **"Did you engage?" feedback** capturing the posted comment (powers the ladder; future content corpus).
- **Conditional source diversity** (low for relationship slot, high for discovery).

v1 deliberately ships the comment-quality win *without* state, so it can go out as a prompt change and be evaluated on its own.

---

## Verification (per CLAUDE.md)

After implementing: trigger the pipeline / daily-direction generation manually, then check `/dailydirection`:
- Each engage card shows a specific, paste-ready draft that **anchors to a real, named detail** from the article (a quote, figure, or specific claim).
- **No generic praise**, no links to Robin's work, no "check out my piece," and **no credential-prefaces** ("As a PM…") in any draft.
- Each draft **carries a delta and ends on an open question/tension**, not a verdict — and is neither sycophantic nor point-scoring.
- The engine **omits an engage item** when nothing in that track clears the Letters-Page Bar (verify it's willing to return zero rather than forcing a weak comment).
- One draft per item, not a menu of options.
- `channel` is sensible (comments for [COMMENTABLE], LinkedIn/X for [NO COMMENTS]).
- Fiction engage reads as a writer's response, not an analyst's.
- The draft sounds like Robin, not corporate/AI boilerplate.
