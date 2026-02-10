import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "../db.js";
import type { Digest, Snippet, Pipeline } from "../types.js";

export function registerDigestTools(server: McpServer): void {
  server.tool(
    "list-digests",
    "List recent curated digests, optionally filtered by pipeline",
    { pipeline: z.string().optional(), limit: z.number().min(1).max(50).default(10) },
    async ({ pipeline, limit }) => {
      const db = getDb();
      let digests: Digest[];
      if (pipeline) {
        digests = db.prepare(
          "SELECT * FROM digests WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT ?"
        ).all(pipeline, limit) as Digest[];
      } else {
        digests = db.prepare(
          "SELECT * FROM digests ORDER BY created_at DESC LIMIT ?"
        ).all(limit) as Digest[];
      }

      const text = digests.length === 0
        ? "No digests found."
        : digests.map((d) =>
          `#${d.id} [${d.pipeline_id}] ${d.title} (${d.created_at})`
        ).join("\n");

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "get-digest",
    "Get a full digest with all key insights",
    { id: z.number() },
    async ({ id }) => {
      const db = getDb();
      const digest = db.prepare("SELECT * FROM digests WHERE id = ?").get(id) as Digest | undefined;
      if (!digest) {
        return { content: [{ type: "text", text: `Digest #${id} not found.` }] };
      }

      const snippets = db.prepare(
        "SELECT * FROM snippets WHERE digest_id = ? ORDER BY position"
      ).all(id) as Snippet[];

      let text = `# ${digest.title}\n`;
      text += `Pipeline: ${digest.pipeline_id} | Created: ${digest.created_at}\n\n`;

      for (const s of snippets) {
        text += `- ${s.key_insight} (${s.source_name})\n`;
      }

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "search-digests",
    "Full-text search across key insights",
    { query: z.string(), pipeline: z.string().optional() },
    async ({ query, pipeline }) => {
      const db = getDb();

      let sql = `
        SELECT s.*, d.title as digest_title, d.pipeline_id, d.created_at as digest_date
        FROM snippets_fts fts
        JOIN snippets s ON s.id = fts.rowid
        JOIN digests d ON s.digest_id = d.id
        WHERE snippets_fts MATCH ?
      `;
      const params: unknown[] = [query];

      if (pipeline) {
        sql += " AND d.pipeline_id = ?";
        params.push(pipeline);
      }
      sql += " ORDER BY rank LIMIT 20";

      const results = db.prepare(sql).all(...params) as (Snippet & {
        digest_title: string;
        pipeline_id: string;
        digest_date: string;
      })[];

      const text = results.length === 0
        ? `No results for "${query}".`
        : results.map((r) =>
          `- ${r.key_insight} (${r.source_name}, ${r.digest_date})`
        ).join("\n");

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "list-pipelines",
    "List all content curation pipelines with status and latest digest date",
    {},
    async () => {
      const db = getDb();
      const pipelines = db.prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM sources WHERE pipeline_id = p.id AND enabled = 1) as source_count,
          (SELECT COUNT(*) FROM digests WHERE pipeline_id = p.id) as digest_count,
          (SELECT MAX(created_at) FROM digests WHERE pipeline_id = p.id) as latest_digest
        FROM pipelines p
        ORDER BY p.name
      `).all() as (Pipeline & { source_count: number; digest_count: number; latest_digest: string | null })[];

      const text = pipelines.length === 0
        ? "No pipelines configured."
        : pipelines.map((p) =>
          `**${p.name}** (${p.id})\n` +
          `  Status: ${p.enabled ? "enabled" : "disabled"}\n` +
          `  Sources: ${p.source_count} | Digests: ${p.digest_count}\n` +
          `  Latest: ${p.latest_digest || "none"}`
        ).join("\n\n");

      return { content: [{ type: "text", text }] };
    },
  );
}
