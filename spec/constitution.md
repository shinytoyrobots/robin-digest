# Constitution — daily-direction-quality

## Prohibitions

1. **No grader changes that invalidate already-graded directions without HITL.** A refinement or replacement of any grader after directions have been scored requires explicit human approval before re-scoring. Variants of the eval suite may be authored in parallel, but only one is "active" per direction at a given time, and the active set is human-controlled.

2. **No automated rewriting of `src/direction/prompts.ts` based on eval scores.** Evals score outputs; they do not edit production prompts. Score-driven prompt proposals must be surfaced as a draft (e.g. a diff or HANDOFF entry) for human review before commit. The eval suite is a measurement instrument, not a generator.

3. **Adversarial datasets must include real failure modes from production directions.** When building or rotating an adversarial dataset, at least 50% of entries must be drawn from actual misfires observed in production `daily_directions` rows (not synthetic LLM-generated cases). Synthetic adversarials are permitted to augment but not replace this floor.

## Preferences (soft)

- Prefer deterministic graders over LLM-as-judge where the rule is structurally checkable (e.g. URL host distinctness, presence/absence of pipe-form refs). LLM-as-judge is reserved for semantic claims (e.g. "this connection is substantive, not vocabulary-shared").
- Prefer adding dimensions over tightening thresholds when prompt rules expand. New rules in `prompts.ts` map to new SRs and new dimensions.
- Prefer surfacing low scores via the existing `/dailydirection` UI (or `/admin/...`) over creating a separate eval dashboard.

## Escalation triggers (HITL surface)

- Any grader replacement (not refinement) → preference-articulator approval required
- Threshold change after directions have been graded against the prior threshold → preference-articulator
- Two consecutive generations of the eval suite fail to discriminate between known-good and known-bad directions → comprehension-auditor

## Dispatch overrides

- `evaluator-depth: standard` for routine direction grading; `adversarial` only on dissent reactivation or quarterly adversarial-dataset refresh
- `generators-per-gen: N/A` — this effort evaluates a single production system, not a multi-variant generation. The `flow-generate` skill is not expected to be invoked.
- `chavruta-on-convergence: false` — convergence semantics don't apply to a measurement-only effort

## Dimension defaults

This effort overrides the default 6 dimensions. Active dimensions:
- `source-diversity` (weight 0.50)
- `internal-external-bridging` (weight 0.50)

The default `correctness`, `performance`, `maintainability`, `accessibility`, `security`, `cost` dimensions are **disabled** for this effort. Rationale: the artifact under evaluation is LLM-generated text content, not executable code. Default dimensions are not applicable.

## Violation policy

- This constitution may be amended via `flow-spec`. Amendments are versioned and recorded in `spec/history/`.
- Skill invocations that violate this constitution halt and surface a dissent rather than proceeding.
