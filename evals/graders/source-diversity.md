# Grader: source-diversity

**Version:** 0.1.0
**Type:** deterministic
**Maps to:** SR-001
**Datasets:** source-diversity-real-v1, source-diversity-adv-v1

## Input format

One JSONL row per direction:

```json
{
  "direction_id": 42,
  "focus_angle": "outreach",
  "suggestions": [
    {"title": "...", "body": "...", "source_refs": ["Article|https://example.com/x", "Robin's vault note"], "category": "writing", "track": "professional"},
    ...
  ],
  "expected_pass": true,
  "notes": "optional human annotation"
}
```

## Scoring rules

For each direction:

1. Filter to regular suggestions: `category != "engage"`.
2. For each regular suggestion `r`, extract the set of external URL hosts:
   - For each entry in `r.source_refs`, look for the `|http` pipe form.
   - If found, parse the URL and extract the hostname; strip leading `www.`.
   - Collect into `E(r)` (a set of hosts).
3. Compute pairwise intersections:
   - For all pairs `(r_i, r_j)` with `i < j`, if `E(r_i) ∩ E(r_j) ≠ ∅`, count one violation.
4. Score:
   - 0 violations → score 1.0
   - 1 violation → score 0.5
   - 2+ violations → score 0.0

## Threshold semantics

- Pass threshold: 0.95 (SR-001 requires effectively no violations across the dataset)
- A direction scoring < 1.0 is a "soft" violation; threshold is set at suite-mean, not per-direction
- `failed-task-rationale` includes the violating host(s) and the indices of the colliding suggestions

## Open ambiguity (OA-1)

The current rule treats two articles from the same publication host as a violation even if they are different articles. The first 10 real-dataset directions should be hand-reviewed to confirm whether this is the desired behavior. If not, scoring rule 2 may be tightened to compare URLs (not hosts).

## Implementation pointer

Reference implementation will live in `evals/runners/source-diversity.ts` (not authored at flow-init time; will be written when first dataset is bootstrapped via `/flow-eval --add-dataset`).

## Versioning

- 0.1.0 — Initial; host-level comparison; 1-violation half-credit
