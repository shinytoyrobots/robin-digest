# Spec v0.3.0 — 2026-05-28

MINOR (additive). Extends the spec to cover the trust-building engagement-comment rules from `HANDOFF-engagement-comments.md` (the engage `draft`/`channel` upgrade). Authored via `/flow-spec`. SR-001..003 and `constitution.md` unchanged.

## Changes from v0.2.0

- **Added** SR-004..010 (engage-suggestion requirements), scoped to `category == "engage"` and the new `draft`/`channel` fields the v1 implementation introduces:
  - SR-004 Specific anchor (LLM-judge → `engage-substance`)
  - SR-005 Trust compliance — no self-link, no ask, no credential-preface (deterministic → `engage-trust-compliance`)
  - SR-006 Open hand — ends on an opening, not a verdict (hybrid → `engage-open-hand`)
  - SR-007 Substance — delta + extends; not sycophantic, not eristic (LLM-judge → `engage-substance`)
  - SR-008 Voice authenticity + automation ceiling (LLM-judge + process invariant → `voice-authenticity`)
  - SR-009 Channel correctness (deterministic → `engage-trust-compliance`)
  - SR-010 Zero-output / Letters-Page bar + single draft (deterministic structural + LLM-judge bar → `engage-trust-compliance` / `engage-substance`)
- **Declared** four new eval dimensions in `harness.yaml`: `engage-trust-compliance`, `engage-substance`, `engage-open-hand`, `voice-authenticity` — all `mapping-pending: true`, `status: pending-implementation`, empty datasets, **zero/pending weight**.
- **Bumped** `harness.yaml` `suite-version` 0.2.0 → 0.3.0; added `weights-pending`, `mappings` SR-004..010, and `notes` for the pending state + adversarial backfill obligation.
- **Added** Open ambiguities OA-3 (Robin-owned domain list for SR-005), OA-4 (recover commentable flag for SR-009 under prompt-only v1), OA-5 (SR-010 "should-have-omitted" needs gatherer-context persistence).

## Critical dependency

The `draft`/`channel` fields do **not** exist in the current `Suggestion` shape (`src/direction/generator.ts`) or in any historical `daily_directions` row. They are introduced by the v1 prompt+code change (`src/direction/prompts.ts`, `generator.ts`, `ui/direction.html.ts`). Therefore:

- SR-004..010 are **active on v1 implementation**; graders can be authored now, but **real datasets cannot be populated until v1 ships and production emits drafts**.
- Per constitution Prohibition 3, the engage adversarial datasets **start synthetic** and carry a backfill obligation: ≥50% real production failure modes once drafts exist, before the dimensions take live weight.
- Live weights of `source-diversity` / `internal-external-bridging` (0.50 / 0.50) are **unchanged**. `constitution.md` is **not** amended — its "active dimensions" list stays accurate while the engage dimensions are pending.

## Conformance mapping status

**mapping-pending: true** — by design. SR-004..010 reference graders/datasets that do not yet exist. `/flow-eval` must author the graders and populate datasets (after v1 ships) before `flow-generate` could act against these SRs. This is the explicit, justified state, not an oversight.

## SR status

- SR-001, SR-002 — implemented + scored (unchanged).
- SR-003 — deferred (LLM-judge adversarial runner unimplemented; unchanged from v0.2.0).
- SR-004..010 — declared; active on v1 engage-draft implementation; datasets pending production draft data.

## Reactivation conditions

- When v1 ships and production emits `draft`/`channel`: `/flow-eval` to author the four pending graders, populate real datasets, backfill ≥50% real adversarials, set thresholds, and rebalance weights (HITL per constitution — threshold/weight changes after grading).
- If the v1 implementation alters the `Suggestion` field names (`draft`/`channel`), SR-004..010 acceptance clauses must be re-checked against the final shape.

## Dissent check

Registry empty (`active-dissents: 0`, no `dissents-active.yaml`). No spec-change reactivation conditions to evaluate.
