# Spec — daily-direction-quality

**Effort:** daily-direction-quality
**Version:** 0.1.0
**Created:** 2026-05-22
**Status:** draft — evals pending dataset population

## Purpose

Evaluate the quality of LLM-generated daily-direction outputs in robin-digest. Each direction produces 4 regular suggestions (2 professional + 2 fiction) and up to 2 engage suggestions (1 per track). The prompt at `src/direction/prompts.ts` enforces several quality rules; this effort verifies those rules are actually followed in generated outputs and surfaces regressions early.

## Scope

In-scope:
- Static post-hoc analysis of stored `daily_directions.suggestions` JSON
- Two dimensions measured per direction: `source-diversity` and `internal-external-bridging`
- Real datasets drawn from production direction rows; adversarial datasets crafted from observed prompt-violation patterns

Out-of-scope (v0):
- Track-purity scoring (each suggestion's `track` field matching its source pipeline) — deferred until v0.2
- Lens coherence (all 4 regular suggestions visibly express the day's focus angle) — deferred
- Automated remediation: scores do not auto-edit prompts; humans review proposals (see `constitution.md`)

## Stable Requirements

### SR-001: Regular-suggestion source distinctness

WHEN a daily direction is generated, the system SHALL produce regular suggestions (category != "engage") whose external source citations (entries in `source_refs` containing a URL via the `text|url` pipe form) are pairwise distinct: no two regular suggestions in the same direction shall cite the same external URL or the same publication host.

**Acceptance:** For any direction D with regular suggestions R = [r1, r2, r3, r4], let E(ri) = the set of external URL hosts cited in ri.source_refs. SR-001 holds iff for all i ≠ j, E(ri) ∩ E(rj) = ∅.

### SR-002: Internal–external bridging

WHEN a daily direction is generated, the system SHALL produce regular suggestions where each suggestion's `source_refs` array contains at least one internal anchor (a `source_ref` without a URL — Robin's own writing or vault material) AND at least one external anchor (a `source_ref` with a URL pointing to a digest snippet).

**Acceptance:** For any regular suggestion r, classify each `source_ref` as internal (no `|http` substring) or external (contains `|http`). SR-002 holds iff r.source_refs contains ≥1 internal entry AND ≥1 external entry.

### SR-003: Adversarial robustness on bridging

WHEN evaluated against the adversarial dataset for `internal-external-bridging` (directions hand-crafted to look superficially bridged but where the internal-external connection is spurious — shared vocabulary, not shared substance), the system's grader SHALL detect spurious bridges at ≥0.80 recall.

**Acceptance:** Recall on adversarial dataset ≥ 0.80 with precision ≥ 0.70.

## Eval mappings (populated as datasets grow)

| SR | Grader | Datasets | Threshold |
|----|--------|----------|-----------|
| SR-001 | source-diversity | source-diversity-real-v1, source-diversity-adv-v1 | 0.95 |
| SR-002 | internal-external-bridging | internal-external-bridging-real-v1 | 0.90 |
| SR-003 | internal-external-bridging (adversarial mode) | internal-external-bridging-adv-v1 | 0.80 |

## Open ambiguities

- **OA-1**: SR-001 treats the same publication host across two suggestions as a violation. This may be too strict if the digest covers multi-article newsletters where two articles from the same Substack legitimately appear. Decision deferred to first real dataset review.
- **OA-2**: SR-002's "internal anchor" check is purely structural (no URL = internal). A future refinement could distinguish Robin's published writing from vault notes via the `vault:` URL scheme, but this is not gated on the v0 grader.

## History

- v0.1.0 — Initial spec from flow-init. Two dimensions (source-diversity, internal-external-bridging). Two prohibitions in constitution.
