import { readFileSync } from "node:fs";

export interface SourceRef {
  text: string;
  url: string | null;  // null = internal anchor; non-null = external
  host: string | null;
}

export interface Suggestion {
  title: string;
  body: string;
  source_refs: string[];
  source_url?: string;
  category: string;
  track?: string;
  draft?: string;    // engage-only: paste-ready comment scaffold
  channel?: string;  // engage-only: comments | linkedin | x | response-post
}

export interface DirectionRow {
  direction_id: number;
  focus_angle: string;
  suggestions: Suggestion[];
  context_summary?: string | null;
  created_at?: string;
  expected_pass?: boolean;
  notes?: string;
}

export function parseSourceRef(raw: string): SourceRef {
  const pipeIdx = raw.indexOf("|http");
  if (pipeIdx > 0) {
    const text = raw.slice(0, pipeIdx).trim();
    const url = raw.slice(pipeIdx + 1).trim();
    let host: string | null = null;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // malformed URL: treat as internal
      return { text: raw, url: null, host: null };
    }
    return { text, url, host };
  }
  return { text: raw, url: null, host: null };
}

export function loadJsonl(path: string): DirectionRow[] {
  const text = readFileSync(path, "utf8");
  const rows: DirectionRow[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed) as DirectionRow);
  }
  return rows;
}

export function regularSuggestions(d: DirectionRow): Suggestion[] {
  return d.suggestions.filter(s => s.category !== "engage");
}

export function engageSuggestions(d: DirectionRow): Suggestion[] {
  return d.suggestions.filter(s => s.category === "engage");
}
