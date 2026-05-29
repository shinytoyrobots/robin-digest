# Grader: engage-trust-compliance

**Version:** 0.1.0
**Type:** deterministic (structural)
**Status:** active (suite v0.4.0)
**Runner:** `evals/runners/engage-trust-compliance.ts`
**SRs:** SR-005, SR-009, SR-010 (structural portion)

## What it scores

Engage suggestions (`category === "engage"`) and their `draft` / `channel`
fields in a `daily_directions` row. These are HARD INVARIANTS — a draft either
complies or it doesn't; there is no partial credit per item.

## Input format

JSONL, one `DirectionRow` per line (see `evals/runners/lib.ts`):

```
{ "direction_id": int, "focus_angle": str, "expected_pass": bool,
  "notes": str, "suggestions": [ { ...Suggestion } ] }
```

Engage suggestions carry `draft` (string) and `channel`
(`comments|linkedin|x|response-post`). `expected_pass` labels the row's ground
truth (`true` = should comply; `false` = a seeded/known violation).

## Checks

A direction is **compliant** iff it has zero violations across:

- **SR-005 — no self-link:** no URL in any engage `draft` resolves to a
  Robin-owned host (`robin-cannon.com`, `robin-cannon.dev`, or a subdomain).
- **SR-005 — no self-promo CTA:** draft does not match the self-promotion
  pattern (`check out my`, `read my`, `my piece/post/essay/article/newsletter/
  substack/blog`, `subscribe to my`, `follow me`, `link in bio/profile`). A
  genuine question to the author is NOT a CTA and is allowed.
- **SR-005 — no credential-preface:** draft does not open a self-introduction
  of role/experience (`as a/an {PM|product manager|designer|design-systems|
  engineer|founder|leader|writer|technologist|cpo}`, `as someone who`,
  `speaking as`, `in my experience as/leading/building`). Targeted patterns —
  "as a result" / "as the author notes" do not trip it.
- **SR-009 — channel correctness:** commentability is re-derived from
  `source_url` (`substack.com` ⇒ commentable; resolves spec OA-4 under a
  prompt-only v1). Commentable ⇒ `channel == "comments"`. Not commentable ⇒
  `channel ∈ {linkedin, x, response-post}`. Missing channel is a violation.
- **SR-010 — structural:** ≤ 1 engage item per `track`; each engage item has a
  non-empty `draft`. (The Letters-Page "bar"/should-have-omitted judgment is
  NOT here — it is deferred to `engage-substance`.)

## Score semantics

- **compliance-rate** = fraction of directions with zero violations. The
  headline metric for the **real** dataset (curated-compliant,
  `expected_pass=true`). Threshold **1.0** — any failure is a real compliance
  bug to investigate, not statistical noise.
- **detection-rate** = among rows labelled `expected_pass=false`, the fraction
  the grader correctly flags as non-compliant. The headline metric for the
  **adversarial** dataset (seeded violations). Threshold **1.0** — every
  unambiguous structural violation must be caught.

## Datasets

- `engage-trust-compliance-real-v1.jsonl` — 5 synthetic compliant seeds
  (committed; no production content). Baseline compliance-rate 1.000.
- `engage-trust-compliance-adv-v1.jsonl` — 7 synthetic single-violation seeds
  (committed). Baseline detection-rate 1.000.

**Backfill obligation (constitution Prohibition 3):** the adversarial set is
currently 100% synthetic because the feature has no production failure history
yet. Once production emits engage drafts and real misfires are observed,
backfill the adversarial set to ≥50% real production failure modes (target
`-v2`), and replace/augment the real set with production-pulled compliant
directions via `GET /admin/directions/export`.

## Precision note

Self-promo and credential-preface checks are deliberately high-precision
(low false-positive) regex. Subtler self-promotion or implied credentialing is
out of scope here and is expected to be caught by the LLM-judge
`voice-authenticity` / `engage-substance` graders once those are bootstrapped.
