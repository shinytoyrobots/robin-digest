// Grader: engage-trust-compliance (SR-005, SR-009, SR-010 structural)
//
// Deterministic structural checks on engage suggestions (category === "engage")
// and their draft/channel fields. These are HARD INVARIANTS, not statistical
// targets — a compliant draft must satisfy ALL of:
//   SR-005  no Robin-owned URL / self-link, no self-promo CTA, no credential-preface
//   SR-009  channel matches commentability ([COMMENTABLE]->comments;
//           [NO COMMENTS]->{linkedin,x,response-post}), commentability re-derived
//           from source_url (resolves spec OA-4 under a prompt-only v1)
//   SR-010  <=1 engage item per track; each engage item carries exactly one
//           non-empty draft (structural part only; the Letters-Page "bar"
//           judgment is deferred to engage-substance)
//
// SCORE SEMANTICS (see evals/graders/engage-trust-compliance.md):
//   compliance-rate = fraction of directions with zero violations.
//     Real dataset (curated-compliant, expected_pass=true): want 1.0.
//   detection-rate  = among directions labelled expected_pass=false, the
//     fraction the grader correctly flags as non-compliant. Adversarial
//     dataset (seeded violations): want 1.0.
//
// Usage: tsx evals/runners/engage-trust-compliance.ts <dataset.jsonl>

import { loadJsonl, engageSuggestions, type DirectionRow, type Suggestion } from "./lib.js";

const ROBIN_DOMAINS = ["robin-cannon.com", "robin-cannon.dev"];
const COMMENTABLE_DOMAINS = ["substack.com"];
const VALID_NONCOMMENT_CHANNELS = ["linkedin", "x", "response-post"];

// Self-promo CTAs (a genuine question to the author is allowed; these solicit
// for Robin's benefit). High-precision patterns to avoid false positives.
const SELF_PROMO = /(check out my|read my|my (own )?(piece|post|essay|article|newsletter|substack|blog)|subscribe to my|follow me\b|link in (bio|profile))/i;

// Credential-prefaces — targeted role/experience self-introductions only,
// so "as a result" / "as the author notes" do NOT false-positive.
const CREDENTIAL_PREFACE = /(\bas (a|an) (pm|product manager|designer|design[- ]systems|engineer|founder|leader|writer|technologist|cpo)\b|\bas someone who\b|\bspeaking as\b|\bin my (experience|years) (as|leading|building)\b)/i;

const URL_RE = /https?:\/\/[^\s)\]]+/gi;

function isCommentable(url: string | undefined): boolean {
  return !!url && COMMENTABLE_DOMAINS.some(d => url.includes(d));
}

function draftViolations(s: Suggestion): string[] {
  const v: string[] = [];
  const draft = (s.draft ?? "").trim();
  if (!draft) {
    v.push("empty-draft");
    return v; // nothing else to check
  }
  // SR-005: no self-link
  for (const m of draft.matchAll(URL_RE)) {
    let host = "";
    try { host = new URL(m[0]).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    if (ROBIN_DOMAINS.some(d => host === d || host.endsWith("." + d))) {
      v.push("self-link");
      break;
    }
  }
  // SR-005: no self-promo CTA
  if (SELF_PROMO.test(draft)) v.push("self-promo-cta");
  // SR-005: no credential-preface
  if (CREDENTIAL_PREFACE.test(draft)) v.push("credential-preface");
  // SR-009: channel correctness
  const ch = s.channel;
  if (!ch) {
    v.push("missing-channel");
  } else if (isCommentable(s.source_url)) {
    if (ch !== "comments") v.push(`channel-mismatch(commentable->${ch})`);
  } else {
    if (!VALID_NONCOMMENT_CHANNELS.includes(ch)) v.push(`channel-invalid(${ch})`);
  }
  return v;
}

export interface DirectionScore {
  direction_id: number;
  focus_angle: string;
  compliant: boolean;
  expected_pass: boolean;
  violations: string[];
}

export function scoreDirection(d: DirectionRow): DirectionScore {
  const engage = engageSuggestions(d);
  const violations: string[] = [];

  // SR-010 structural: <=1 engage item per track
  const byTrack = new Map<string, number>();
  for (const s of engage) {
    const t = s.track ?? "professional";
    byTrack.set(t, (byTrack.get(t) ?? 0) + 1);
  }
  for (const [track, n] of byTrack) {
    if (n > 1) violations.push(`multiple-engage-in-track(${track}:${n})`);
  }

  // Per engage item
  engage.forEach((s, i) => {
    for (const vio of draftViolations(s)) violations.push(`engage[${i}]:${vio}`);
  });

  return {
    direction_id: d.direction_id,
    focus_angle: d.focus_angle,
    compliant: violations.length === 0,
    expected_pass: d.expected_pass ?? true,
    violations,
  };
}

export function scoreDataset(rows: DirectionRow[]): {
  complianceRate: number;
  detectionRate: number | null;
  scores: DirectionScore[];
} {
  const scores = rows.map(scoreDirection);
  const complianceRate = scores.length
    ? scores.filter(s => s.compliant).length / scores.length
    : 1;
  const shouldFail = scores.filter(s => !s.expected_pass);
  const detectionRate = shouldFail.length
    ? shouldFail.filter(s => !s.compliant).length / shouldFail.length
    : null;
  return { complianceRate, detectionRate, scores };
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx evals/runners/engage-trust-compliance.ts <dataset.jsonl>");
    process.exit(1);
  }
  const rows = loadJsonl(path);
  const { complianceRate, detectionRate, scores } = scoreDataset(rows);
  const hasAdversarial = scores.some(s => !s.expected_pass);

  console.log(`engage-trust-compliance grader v0.1.0`);
  console.log(`dataset: ${path}`);
  console.log(`directions: ${rows.length}`);
  console.log(`compliance-rate: ${complianceRate.toFixed(3)} (threshold 1.0 — ${complianceRate >= 1 ? "PASS" : "FAIL"})`);
  if (hasAdversarial && detectionRate !== null) {
    console.log(`detection-rate:  ${detectionRate.toFixed(3)} (threshold 1.0 — ${detectionRate >= 1 ? "PASS" : "FAIL"})`);
  }
  console.log("");
  console.log("Non-compliant directions:");
  let any = false;
  for (const s of scores) {
    if (!s.compliant) {
      any = true;
      const tag = s.expected_pass ? "UNEXPECTED" : "caught";
      console.log(`  #${s.direction_id} [${s.focus_angle}] (${tag}) — ${s.violations.join("; ")}`);
    }
  }
  if (!any) console.log("  (none)");
  // Missed adversarials (expected to fail but graded compliant)
  const missed = scores.filter(s => !s.expected_pass && s.compliant);
  if (missed.length) {
    console.log("");
    console.log("MISSED violations (expected_pass=false but graded compliant):");
    for (const s of missed) console.log(`  #${s.direction_id} [${s.focus_angle}]`);
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) main();
