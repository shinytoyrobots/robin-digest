// Grader: internal-external-bridging (SR-002, real mode; SR-003 adversarial mode is deferred)
//
// Real mode (deterministic):
//   For each regular suggestion, pass iff source_refs contains
//   >=1 internal anchor (no URL) AND >=1 external anchor (with URL).
//   Direction score = (passing suggestions) / (total regular suggestions).
//
// Adversarial mode (LLM-judge): not implemented in this runner; deferred until
// internal-external-bridging-adv-v1.jsonl is populated with real failure modes.
//
// Usage: tsx evals/runners/internal-external-bridging.ts evals/datasets/internal-external-bridging-real-v1.jsonl

import { loadJsonl, parseSourceRef, regularSuggestions, type DirectionRow } from "./lib.js";

interface SuggestionScore {
  index: number;
  passes: boolean;
  internal_count: number;
  external_count: number;
}

interface DirectionScore {
  direction_id: number;
  focus_angle: string;
  score: number;
  per_suggestion: SuggestionScore[];
}

export function scoreDirection(d: DirectionRow): DirectionScore {
  const regular = regularSuggestions(d);
  const per: SuggestionScore[] = regular.map((s, index) => {
    let internal = 0, external = 0;
    for (const raw of s.source_refs ?? []) {
      const ref = parseSourceRef(raw);
      if (ref.url) external++;
      else internal++;
    }
    return {
      index,
      passes: internal >= 1 && external >= 1,
      internal_count: internal,
      external_count: external,
    };
  });
  const passing = per.filter(p => p.passes).length;
  const score = per.length > 0 ? passing / per.length : 1.0;
  return { direction_id: d.direction_id, focus_angle: d.focus_angle, score, per_suggestion: per };
}

export function scoreDataset(rows: DirectionRow[]): { mean: number; scores: DirectionScore[] } {
  const scores = rows.map(scoreDirection);
  const mean = scores.length > 0 ? scores.reduce((acc, s) => acc + s.score, 0) / scores.length : 0;
  return { mean, scores };
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx evals/runners/internal-external-bridging.ts <dataset.jsonl>");
    process.exit(1);
  }
  const rows = loadJsonl(path);
  const { mean, scores } = scoreDataset(rows);
  const fullPass = scores.filter(s => s.score === 1.0).length;
  const partial = scores.filter(s => s.score > 0 && s.score < 1.0).length;
  const total = scores.filter(s => s.score === 0.0).length;

  console.log(`internal-external-bridging grader v0.1.0 (real mode)`);
  console.log(`dataset: ${path}`);
  console.log(`directions: ${rows.length}`);
  console.log(`mean score: ${mean.toFixed(3)}`);
  console.log(`distribution: ${fullPass} all-pass / ${partial} partial / ${total} all-fail`);
  console.log(`threshold: 0.90 — ${mean >= 0.90 ? "PASS" : "FAIL"}`);
  console.log("");
  console.log("Directions with any failures:");
  for (const s of scores) {
    if (s.score < 1.0) {
      const failed = s.per_suggestion.filter(p => !p.passes);
      const detail = failed.map(f => `s${f.index} (int=${f.internal_count} ext=${f.external_count})`).join(", ");
      console.log(`  #${s.direction_id} [${s.focus_angle}] score=${s.score.toFixed(2)} — failures: ${detail}`);
    }
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) main();
