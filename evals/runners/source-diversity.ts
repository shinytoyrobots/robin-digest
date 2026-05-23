// Grader: source-diversity (SR-001)
//
// Score = mean over directions of:
//   1.0 if 0 host collisions across regular suggestions
//   0.5 if 1 host collision
//   0.0 if 2+ host collisions
//
// Usage: tsx evals/runners/source-diversity.ts evals/datasets/source-diversity-real-v1.jsonl

import { loadJsonl, parseSourceRef, regularSuggestions, type DirectionRow } from "./lib.js";

interface DirectionScore {
  direction_id: number;
  focus_angle: string;
  score: number;
  collisions: { host: string; suggestion_indices: number[] }[];
}

export function scoreDirection(d: DirectionRow): DirectionScore {
  const regular = regularSuggestions(d);
  // Map host -> indices of regular suggestions citing it
  const hostToIndices = new Map<string, number[]>();
  regular.forEach((s, idx) => {
    const hosts = new Set<string>();
    for (const raw of s.source_refs ?? []) {
      const ref = parseSourceRef(raw);
      if (ref.host) hosts.add(ref.host);
    }
    for (const h of hosts) {
      if (!hostToIndices.has(h)) hostToIndices.set(h, []);
      hostToIndices.get(h)!.push(idx);
    }
  });

  const collisions: { host: string; suggestion_indices: number[] }[] = [];
  for (const [host, indices] of hostToIndices) {
    if (indices.length > 1) collisions.push({ host, suggestion_indices: indices });
  }

  let score: number;
  if (collisions.length === 0) score = 1.0;
  else if (collisions.length === 1) score = 0.5;
  else score = 0.0;

  return { direction_id: d.direction_id, focus_angle: d.focus_angle, score, collisions };
}

export function scoreDataset(rows: DirectionRow[]): { mean: number; scores: DirectionScore[] } {
  const scores = rows.map(scoreDirection);
  const mean = scores.length > 0 ? scores.reduce((acc, s) => acc + s.score, 0) / scores.length : 0;
  return { mean, scores };
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx evals/runners/source-diversity.ts <dataset.jsonl>");
    process.exit(1);
  }
  const rows = loadJsonl(path);
  const { mean, scores } = scoreDataset(rows);
  const passing = scores.filter(s => s.score === 1.0).length;
  const partial = scores.filter(s => s.score === 0.5).length;
  const failing = scores.filter(s => s.score === 0.0).length;

  console.log(`source-diversity grader v0.1.0`);
  console.log(`dataset: ${path}`);
  console.log(`directions: ${rows.length}`);
  console.log(`mean score: ${mean.toFixed(3)}`);
  console.log(`distribution: ${passing} pass / ${partial} partial / ${failing} fail`);
  console.log(`threshold: 0.95 — ${mean >= 0.95 ? "PASS" : "FAIL"}`);
  console.log("");
  console.log("Failures and partials:");
  for (const s of scores) {
    if (s.score < 1.0) {
      const collisionList = s.collisions.map(c => `${c.host} (suggestions ${c.suggestion_indices.join(",")})`).join("; ");
      console.log(`  #${s.direction_id} [${s.focus_angle}] score=${s.score} — ${collisionList}`);
    }
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) main();
