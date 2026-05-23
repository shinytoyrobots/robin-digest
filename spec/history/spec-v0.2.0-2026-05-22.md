# Spec v0.2.0 — 2026-05-22

Bootstrap of source-diversity and internal-external-bridging dimensions via `/flow-eval bootstrap both`.

## Changes from v0.1.0

- **Added** `evals/runners/lib.ts`, `evals/runners/source-diversity.ts`, `evals/runners/internal-external-bridging.ts` — first executable graders
- **Added** real datasets populated from 50 production directions pulled via the new `GET /admin/directions/export` endpoint (commit 1d400a1)
- **Split** datasets into real (holdout passing) and adv (known failure rows) per dimension
- **Added** `threshold-adversarial` field per dimension in `harness.yaml`; set to current adv-mean as no-regression floor
- **Added** `baseline-2026-05-22` block to `harness.yaml` recording initial scores
- **Added** `adversarial-snapshot-limitation` note documenting the v0.3.0 upgrade path

## Baseline scores (2026-05-22)

| Dataset | n | Score | Threshold | Result |
|---------|---|-------|-----------|--------|
| source-diversity-real-v1 | 46 | 1.000 | 0.95 | PASS |
| source-diversity-adv-v1 | 4 | 0.500 | 0.50 (adv floor) | PASS-AT-FLOOR |
| internal-external-bridging-real-v1 | 45 | 1.000 | 0.90 | PASS |
| internal-external-bridging-adv-v1 | 5 | 0.600 | 0.60 (adv floor) | PASS-AT-FLOOR |

## SR status

- SR-001 — implemented + scored (source-diversity grader)
- SR-002 — implemented + scored (internal-external-bridging real mode)
- SR-003 — **deferred**. The LLM-judge adversarial mode is specified in `evals/graders/internal-external-bridging.md` but not yet implemented in the runner. The current adversarial dataset tests structural failures (missing external anchor), not spurious bridges. SR-003 will become testable when (a) the LLM-judge runner is written AND (b) hand-labeled spurious-bridge cases are added to the adversarial dataset.

## Known limitations

- **Adversarial datasets are output snapshots, not input probes.** They cannot improve over time because the inputs that produced them are not persisted. v0.3.0 should add gatherer-context persistence and convert adversarial cases to re-runnable probes.
- **All datasets gitignored.** Per session policy, production direction content stays local. Anyone cloning the repo will need to re-pull data via `/admin/directions/export` to score anything.

## Reactivation conditions

- If a future prompt iteration drops the real-mean below 0.95 (source-diversity) or 0.90 (bridging), the grader will flag regression
- If a future adversarial pull surfaces new failure modes structurally distinct from current ones, suite version should bump (refinement → patch; replacement → major)
