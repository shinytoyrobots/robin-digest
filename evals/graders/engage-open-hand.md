# Grader: engage-open-hand

**Version:** 0.1.0 (DESIGN ONLY — not yet implemented)
**Type:** hybrid (deterministic signal + llm-judge)
**Status:** pending-implementation (datasets pending production draft data)
**Runner:** _(not written)_
**SRs:** SR-006 (ends on an opening, not a verdict)

## What it will score

Whether an engage `draft` closes on an **opening** — an unresolved tension or a
genuine question — rather than a verdict or a neat bow.

## Approach (hybrid)

1. **Deterministic fast signal:** if the final sentence ends in `?`, that's a
   strong positive (likely open). If it ends on a flat declarative summary,
   that's a weak signal toward "closed".
2. **LLM-judge adjudication:** the terminal-`?` signal is necessary-ish but not
   sufficient — a question can still close ("Don't you agree?") and a statement
   can still open ("Which leaves the harder question unanswered."). The judge
   decides `opens` vs `closes` on the *function* of the ending, not its
   punctuation.

The judge returns `{ opens: bool, reason: str }` per draft. PASS iff `opens`.

## Datasets (pending)

- `engage-open-hand-real-v1.jsonl` — production drafts labelled opens/closes.
- `engage-open-hand-adv-v1.jsonl` — rhetorical-question-that-closes,
  declarative-that-opens, and verdict-with-a-trailing-question-mark cases, so
  the judge can't rely on punctuation. ≥50% real per Prohibition 3.

## Bootstrap trigger

Same as `engage-substance`: implement once enough production drafts exist to
calibrate and build a holdout. Stays `mapping-pending`, zero weight, until then.
