# Grader: internal-external-bridging

**Version:** 0.1.0
**Type:** hybrid (deterministic structural + LLM-judge semantic)
**Maps to:** SR-002 (real mode), SR-003 (adversarial mode)
**Datasets:** internal-external-bridging-real-v1, internal-external-bridging-adv-v1

## Input format

Same row schema as `source-diversity.md`: one JSONL row per direction.

## Scoring rules

### Real mode (SR-002, threshold 0.90)

Deterministic-only. For each direction:

1. Filter to regular suggestions: `category != "engage"`.
2. For each regular suggestion `r`:
   - Internal anchors: count `source_refs` entries that do NOT contain `|http`
   - External anchors: count `source_refs` entries that DO contain `|http`
   - `r` passes iff both counts ≥ 1
3. Score = (passing suggestions) / (total regular suggestions)

### Adversarial mode (SR-003, threshold 0.80)

Structural + LLM-judge. For each direction that structurally passes (real-mode score = 1.0), apply LLM-judge to detect *spurious* bridges:

1. For each regular suggestion `r`, extract the internal anchor's text and the external anchor's title/snippet.
2. Prompt the judge (Claude Sonnet, temperature 0.0):

   ```
   You are checking whether two pieces of content share substance, not just vocabulary.

   Internal: "{internal_anchor_text}"
   External: "{external_title} — {external_snippet}"

   Q1: In one sentence, what is the internal piece actually about?
   Q2: In one sentence, what is the external piece actually about?
   Q3: Do these share an argument, claim, or substantive concept (yes/no)?
       If yes, name the shared substance in 5-10 words.
       If no, name the shared words that are doing the deceptive lifting.

   Output JSON: {"q1": "...", "q2": "...", "shares_substance": true|false, "shared_substance_or_shared_words": "..."}
   ```

3. A suggestion is a *spurious bridge* iff `shares_substance: false`.
4. Adversarial score = 1 - (spurious bridges) / (total regular suggestions).

### Combined recall/precision for SR-003

- Recall: fraction of known-spurious bridges (labeled in adversarial dataset) the judge flags. Target ≥ 0.80.
- Precision: fraction of judge-flagged spurious bridges that are actually spurious (per gold label). Target ≥ 0.70.

## Threshold semantics

- Real mode threshold: 0.90 (most directions should structurally pass; occasional miss is tolerated)
- Adversarial mode threshold: 0.80 (judge recall on planted spurious bridges)
- Failure rationale includes which suggestion(s) failed and why (missing anchor type, or detected spurious bridge with shared-words explanation)

## Open ambiguity (OA-2)

Current implementation treats any URL-less `source_ref` as an internal anchor. A vault note (`vault:...` in the writing-cache URL scheme) is internal-but-published; a plain string with no scheme is internal-and-unpublished. The grader does not currently distinguish these. Future refinement may require ≥1 published-writing reference to count as a "strong" internal anchor.

## Implementation pointer

Real-mode runner: `evals/runners/internal-external-bridging-real.ts` (not yet authored)
Adversarial-mode runner: `evals/runners/internal-external-bridging-adv.ts` (not yet authored)
Both bootstrapped via `/flow-eval --add-dataset`.

## Versioning

- 0.1.0 — Initial; structural deterministic + Sonnet LLM-judge for adversarial mode
