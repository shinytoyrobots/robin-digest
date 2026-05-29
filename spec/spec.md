# Spec — daily-direction-quality

**Effort:** daily-direction-quality
**Version:** 0.3.0
**Created:** 2026-05-22
**Status:** draft — SR-001..003 active; SR-004..010 active on v1 engage-draft implementation, datasets pending production draft data

## Purpose

Evaluate the quality of LLM-generated daily-direction outputs in robin-digest. Each direction produces 4 regular suggestions (2 professional + 2 fiction) and up to 2 engage suggestions (1 per track). The prompt at `src/direction/prompts.ts` enforces several quality rules; this effort verifies those rules are actually followed in generated outputs and surfaces regressions early.

v0.3.0 extends the spec to cover the trust-building engagement-comment rules (the engage `draft`/`channel` upgrade described in `HANDOFF-engagement-comments.md`). These rules apply ONLY to engage suggestions (`category == "engage"`).

## Scope

In-scope:
- Static post-hoc analysis of stored `daily_directions.suggestions` JSON
- Regular-suggestion dimensions: `source-diversity` and `internal-external-bridging` (SR-001..003, active)
- Engage-suggestion dimensions: `engage-trust-compliance`, `engage-substance`, `engage-open-hand`, `voice-authenticity` (SR-004..010, declared; see pending-dimension note)
- Real datasets drawn from production direction rows; adversarial datasets crafted from observed prompt-violation patterns

Out-of-scope (v0):
- Track-purity scoring (each suggestion's `track` field matching its source pipeline) — deferred until v0.2
- Lens coherence (all 4 regular suggestions visibly express the day's focus angle) — deferred
- Automated remediation: scores do not auto-edit prompts; humans review proposals (see `constitution.md`)

Out-of-scope (v0.3.0 engage):
- The stateful "Inner Circle / relationship ladder" engagement work — explicitly deferred to v2 per the handoff
- Platform norms beyond blog/Substack/LinkedIn/X/response-post (HN/Reddit/Mastodon/Bluesky) — flagged for v2

### Pending-dimension note (CRITICAL — read before populating datasets)

The `draft` and `channel` fields do **not** exist in the current `Suggestion` shape (`src/direction/generator.ts` carries only `title`, `body`, `source_refs`, `source_url`, `category`, `track`) and therefore do **not** exist in any historical `daily_directions` row. They are introduced by the v1 prompt+code change described in `HANDOFF-engagement-comments.md` (touches `src/direction/prompts.ts`, `src/direction/generator.ts`, `src/ui/direction.html.ts`).

Consequently:
- SR-004..010 are **active on v1 implementation**; their graders can be authored now, but **real datasets cannot be populated until v1 ships and production emits `draft`/`channel` data**.
- The four new eval dimensions (`engage-trust-compliance`, `engage-substance`, `engage-open-hand`, `voice-authenticity`) are **declared but pending** in `harness.yaml`: `mapping-pending: true`, `status: pending-implementation`, with **empty datasets** and **pending/zero weight**.
- Per constitution Prohibition 3 (adversarial datasets must be ≥50% real production failure modes), the adversarial datasets for these dimensions **start synthetic** with an explicit backfill obligation: once v1 ships and production emits drafts, backfill ≥50% real production failure modes before the dimensions carry live weight.
- The new dimensions do **NOT** change the live weights of `source-diversity` / `internal-external-bridging` (both remain 0.50). Weight rebalance happens via `/flow-eval` once real datasets exist.
- `constitution.md` is **not** amended in v0.3.0: its "active dimensions" list (source-diversity 0.50, internal-external-bridging 0.50) stays accurate while the engage dimensions are pending.

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

---

### Engage-suggestion requirements (SR-004..010)

> **Status (applies to SR-004..010):** active on v1 engage-draft implementation; datasets pending production draft data. Each SR scores the `draft` (and, where stated, `channel`) field of suggestions where `category == "engage"`. No historical row carries these fields — see the Pending-dimension note in Scope.

### SR-004: Specific anchor

WHEN an engage suggestion is generated, the system SHALL produce a `draft` that references a specific detail from the source article — a quotation, a named claim, a concrete example, or a figure. Generic praise (e.g. "Great post", "So true") with no specific anchor is a violation.

**Acceptance:** For an engage suggestion e, SR-004 holds iff e.draft references at least one identifiable specific detail traceable to the source article, and does not consist of generic praise. **Checkability: LLM-judge** (a partial structural signal — presence of a quoted span or a token overlapping the article — may pre-filter, but the substantive judgment is the LLM-judge). Maps to `engage-substance`.

### SR-005: Trust compliance (structural)

WHEN an engage suggestion is generated, the system SHALL produce a `draft` that contains NO URL to Robin's own work (no `robin-cannon.com` / `robin-cannon.dev` link and no "check out my piece"-style self-link), NO ask or call-to-action, and NO credential-preface (patterns such as "As a PM", "As someone who", "Speaking as").

**Acceptance:** For an engage suggestion e, SR-005 holds iff e.draft matches none of: (a) a URL whose host is a Robin-owned domain or a self-referential link phrase; (b) a CTA/ask pattern; (c) a credential-preface pattern ("As a {role}", "As someone who…", "Speaking as…"). **Checkability: Deterministic** (regex/host matching). Maps to `engage-trust-compliance`.

### SR-006: Open hand

WHEN an engage suggestion is generated, the system SHALL produce a `draft` that ends on an opening — an unresolved tension or a genuine question — rather than a verdict or a closing statement.

**Acceptance:** For an engage suggestion e, SR-006 holds iff e.draft closes on an opening. **Checkability: Hybrid** — a deterministic terminal-question signal (final sentence ends in `?` or names an explicit unresolved tension) provides a fast positive signal; the LLM-judge adjudicates "opens vs. closes" for drafts where the terminal signal is absent or ambiguous (a question can still close; a statement can still open). Maps to `engage-open-hand`.

### SR-007: Substance (delta, not sycophancy or eristic)

WHEN an engage suggestion is generated, the system SHALL produce a `draft` that carries a delta and extends the thread: it SHALL NOT be sycophantic (net-agreement with no added information or tension) and SHALL NOT be eristic (a mere correction or one-upmanship of the author rather than an extension of the conversation).

**Acceptance:** For an engage suggestion e, SR-007 holds iff e.draft adds information, perspective, evidence, or productive tension beyond the article (non-sycophantic) AND its move extends rather than corrects/outperforms the author (non-eristic). **Checkability: LLM-judge.** Maps to `engage-substance`.

### SR-008: Voice authenticity and automation ceiling

WHEN an engage suggestion is generated, the system SHALL produce a `draft` that reads as a scaffold in Robin's voice — ready-to-edit advice, not corporate or AI boilerplate.

WHILE the engagement engine operates, it SHALL remain at the advice / ready-to-edit-scaffold level and SHALL NEVER auto-post a `draft`.

**Acceptance:** For an engage suggestion e, the voice clause holds iff e.draft reads as Robin's own voice (not corporate/AI-generic register) — **Checkability: LLM-judge.** The automation-ceiling clause is a **process invariant**: the production path SHALL have no code path that posts a `draft` to any external surface; the engine's ceiling is "ready-to-edit scaffold". This invariant is asserted as a system property (verified by the absence of any auto-post path), not by scoring direction rows. Maps to `voice-authenticity`.

### SR-009: Channel correctness

WHEN an engage suggestion is generated for a source whose commentability is known, the system SHALL set `channel` to match that commentability: IF the source is `[COMMENTABLE]`, THEN `channel == "comments"`; IF the source is `[NO COMMENTS]`, THEN `channel ∈ {"linkedin", "x", "response-post"}`.

**Acceptance:** For an engage suggestion e with a known source commentable flag, SR-009 holds iff (source commentable ⇒ e.channel == "comments") AND (source not commentable ⇒ e.channel ∈ {"linkedin", "x", "response-post"}). **Checkability: Deterministic**, given the source's commentable flag. Maps to `engage-trust-compliance`.

### SR-010: Zero-output / Letters-Page bar and single draft

IF no item published in the last 7 days within a track clears the quality bar, THEN the system SHALL OMIT that track's engage item rather than emit a weak one.

WHEN an engage item is produced, the system SHALL emit at most one `draft` for that item (no menu of variants), and SHALL emit at most one engage item per track.

**Acceptance:** For any direction D: (a) **Deterministic** — each engage item carries exactly one `draft` (no array/list of draft variants), and D contains at most one engage suggestion per `track`; (b) **LLM-judge (partially deferrable)** — for a track that emitted an engage item, the judge assesses whether the chosen item cleared the Letters-Page bar (specific, value-adding, worth a stranger's time), and for an omitted track, whether omission was the correct call. The "should have omitted" judgment requires the gathered candidate context and may be partially deferred until gatherer-context persistence (tracked in `harness.yaml` `adversarial-snapshot-limitation`). Maps to `engage-trust-compliance` (structural ≤1-draft / ≤1-engage part); the LLM-judge bar component maps to `engage-substance`.

## Eval mappings (populated as datasets grow)

| SR | Grader | Datasets | Threshold | Status |
|----|--------|----------|-----------|--------|
| SR-001 | source-diversity | source-diversity-real-v1, source-diversity-adv-v1 | 0.95 | active |
| SR-002 | internal-external-bridging | internal-external-bridging-real-v1 | 0.90 | active |
| SR-003 | internal-external-bridging (adversarial mode) | internal-external-bridging-adv-v1 | 0.80 | active |
| SR-004 | engage-substance | (pending) | TBD | mapping-pending; pending-implementation |
| SR-005 | engage-trust-compliance | (pending) | TBD | mapping-pending; pending-implementation |
| SR-006 | engage-open-hand | (pending) | TBD | mapping-pending; pending-implementation |
| SR-007 | engage-substance | (pending) | TBD | mapping-pending; pending-implementation |
| SR-008 | voice-authenticity | (pending) | TBD | mapping-pending; pending-implementation |
| SR-009 | engage-trust-compliance | (pending) | TBD | mapping-pending; pending-implementation |
| SR-010 | engage-trust-compliance (+ engage-substance for bar) | (pending) | TBD | mapping-pending; pending-implementation |

Pending dimensions resolve their datasets and thresholds via `/flow-eval` once v1 ships and production emits `draft`/`channel` data. Until then they carry no live weight and the live weights of `source-diversity` (0.50) and `internal-external-bridging` (0.50) are unchanged.

## Open ambiguities

- **OA-1**: SR-001 treats the same publication host across two suggestions as a violation. This may be too strict if the digest covers multi-article newsletters where two articles from the same Substack legitimately appear. Decision deferred to first real dataset review.
- **OA-2**: SR-002's "internal anchor" check is purely structural (no URL = internal). A future refinement could distinguish Robin's published writing from vault notes via the `vault:` URL scheme, but this is not gated on the v0 grader.
- **OA-3** (v0.3.0): SR-005's Robin-owned-domain list (currently `robin-cannon.com`, `robin-cannon.dev`) must be confirmed against the live deployment before the deterministic grader ships. The handoff names `robin-cannon.com`; CLAUDE.md notes `robin-cannon.dev` CNAMEs to the digest. The grader should match both plus the canonical apex.
- **OA-4** (v0.3.0): SR-009 requires the source's commentable flag (`[COMMENTABLE]` / `[NO COMMENTS]`) to be recoverable at grading time. v1 is prompt-first with no schema change; if the flag is not persisted on the direction row, channel-correctness scoring requires re-deriving commentability from the source. Resolve when populating the `engage-trust-compliance` real dataset.
- **OA-5** (v0.3.0): SR-010's "should have omitted" judgment needs the gathered candidate set per direction, which is not persisted today (see `adversarial-snapshot-limitation`). The structural sub-checks (≤1 draft/item, ≤1 engage/track) are scoreable now; the bar-judgment is deferred until gatherer-context persistence.

## History

- v0.1.0 — Initial spec from flow-init. Two dimensions (source-diversity, internal-external-bridging). Two prohibitions in constitution.
- v0.2.0 — Bootstrap of source-diversity and internal-external-bridging graders + real/adv datasets via `/flow-eval bootstrap both`. Baseline scores recorded in `harness.yaml`.
- v0.3.0 — MINOR (additive). Added SR-004..010 formalizing the trust-building engage-comment rules (`HANDOFF-engagement-comments.md`), scoped to `category == "engage"` and the new `draft`/`channel` fields. Declared four pending dimensions (`engage-trust-compliance`, `engage-substance`, `engage-open-hand`, `voice-authenticity`) with empty datasets and zero/pending weight. SR-001..003 unchanged; constitution unchanged. Datasets pending v1 production draft data; adversarials start synthetic with ≥50%-real backfill obligation per constitution Prohibition 3.
