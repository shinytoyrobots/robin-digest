# Grader: engage-substance

**Version:** 0.1.0 (DESIGN ONLY — not yet implemented)
**Type:** llm-judge
**Status:** pending-implementation (datasets pending production draft data)
**Runner:** _(not written)_
**SRs:** SR-004 (specific anchor), SR-007 (delta / non-sycophantic / non-eristic), + SR-010 Letters-Page "bar" component

## What it will score

The substance of an engage `draft` — the qualities that are semantic, not
structural, and so cannot be checked deterministically.

## Judge rubric (per engage draft)

A draft PASSES only if all hold:

1. **Specific anchor (SR-004):** references an identifiable specific detail from
   the source article — a quotation, a named claim, a concrete example, a
   figure. Generic praise ("great post", "so true") with no anchor FAILS.
2. **Carries a delta (SR-007):** adds information, a perspective, evidence, or a
   productive tension beyond what the article already says. Pure agreement with
   no addition (sycophancy) FAILS.
3. **Extends, not scores (SR-007):** the move opens or advances the
   conversation rather than correcting/outperforming the author (eristic).
   One-upmanship FAILS.
4. **Clears the Letters-Page bar (SR-010 judgment):** would earn a slot on a
   curated letters page — worth a stranger's time. Borderline/filler FAILS.

The judge returns `{ pass: bool, anchor: str|null, reason: str }` per draft.

## Datasets (pending)

- `engage-substance-real-v1.jsonl` — production drafts hand-labelled pass/fail.
- `engage-substance-adv-v1.jsonl` — near-misses: anchored-but-sycophantic,
  specific-but-eristic, plausible-but-generic. ≥50% from real production
  misfires per constitution Prohibition 3.

## Bootstrap trigger

Implement once production has accumulated enough engage drafts to (a) calibrate
the judge prompt and (b) build a hand-labelled holdout (~30–50 real drafts).
Until then this dimension stays `mapping-pending`, zero weight, in `harness.yaml`.

## Goodhart note

LLM-judge for "substance" is the dimension most exposed to reward-hacking
(drafts that perform specificity without genuine engagement). The adversarial
set must include drafts that name a detail yet add nothing — the judge must
fail those, not be fooled by surface specificity.
