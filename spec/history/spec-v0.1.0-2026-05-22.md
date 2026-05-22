# Spec v0.1.0 — 2026-05-22

Initial spec for the `daily-direction-quality` effort.

## Seed source

Authored from scratch during `/flow-init`. No prior PRD or delivery-team handoff. Context drawn from:
- `src/direction/prompts.ts` — the production prompt whose output rules this effort evaluates
- `src/direction/generator.ts` — output schema (`Suggestion` type)
- Two-track direction implementation shipped in commit prior to this effort (commit message TBD on next push)

## SRs added

- SR-001: regular-suggestion source distinctness (maps to `source-diversity` dimension)
- SR-002: internal–external bridging (maps to `internal-external-bridging` dimension)
- SR-003: adversarial robustness on bridging (maps to adversarial mode of `internal-external-bridging` grader)

## Constitution decisions

- 3 prohibitions selected: no grader changes invalidating prior scores w/o HITL, no auto-rewrite of prompts.ts, adversarial datasets must include real failure modes
- HITL mode: comprehension-auditor
- Default 6 dimensions disabled — replaced by 2 custom dimensions

## Deferred

- track-purity dimension (deferred to v0.2)
- lens-coherence dimension (deferred)
- Resolution of OA-1 (same-host across suggestions strictness) and OA-2 (vault vs published-writing distinction)

## Reactivation conditions

None at v0.1.0 — no prior dissents.
