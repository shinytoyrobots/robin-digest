# Grader: voice-authenticity

**Version:** 0.1.0 (DESIGN ONLY — not yet implemented)
**Type:** llm-judge (+ process invariant)
**Status:** pending-implementation (datasets pending production draft data)
**Runner:** _(not written)_
**SRs:** SR-008 (Robin's voice; automation ceiling)

## What it will score

Whether an engage `draft` reads as a ready-to-edit scaffold **in Robin's
voice** — not corporate or AI-generic register. The per-track voice specs in
`src/direction/voice-specs.ts` are the reference standard.

## Judge rubric (per engage draft)

The judge receives the draft, its `track`, and the matching voice spec
(Professional or Fiction). PASS iff:

1. **Register match:** matches the track's core voice (professional = warm
   directness / systems-thinking; fiction = street-level, quiet conviction,
   implication over declaration).
2. **AI-tell clean:** does not trip the spec's "AI Pattern Check" — flagged
   vocabulary clusters (delve, tapestry, testament, leverage, underscore,
   seamless, …), mechanical "not X but Y", uniform sentence length, trailing
   participials, neat reflective wrap-ups.
3. **Not corporate boilerplate:** could only have been written by Robin, not by
   any commenter about any article.

Returns `{ pass: bool, register_ok: bool, ai_tells: str[], reason: str }`.

## Process invariant (not row-scored)

SR-008 also asserts an **automation ceiling**: the production path has no code
that auto-posts a draft to any external surface — the engine stops at
"ready-to-edit scaffold". This is verified as a system property (absence of an
auto-post path), NOT by scoring direction rows. Confirmed at v1: drafts render
with a Copy button on `/dailydirection`; nothing posts.

## Datasets (pending)

- `voice-authenticity-real-v1.jsonl` — production drafts labelled in-voice/off.
- `voice-authenticity-adv-v1.jsonl` — drafts that are *substantively fine* but
  AI-generic in register (the hard case: right content, wrong voice), plus
  ones that overuse Robin's own tics (e.g. "not X, but Y" every sentence).
  ≥50% real per Prohibition 3.

## Bootstrap trigger

Implement once production has enough drafts to calibrate against the voice
specs and build a hand-labelled holdout. Stays `mapping-pending`, zero weight.

## Goodhart note

The risk is the judge rewarding surface markers of voice (an analogy, a short
closer) while missing genuine register drift. The adversarial set must include
drafts that deploy Robin's signature moves mechanically — voice cosplay — and
the judge must fail those.
