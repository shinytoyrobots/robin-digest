import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "../db.js";
import type { Pipeline, Digest, Snippet } from "../types.js";

export function registerDigestResources(server: McpServer): void {
  // Dynamic resource: latest digest per pipeline
  const db = getDb();
  const pipelines = db.prepare(
    "SELECT * FROM pipelines WHERE enabled = 1"
  ).all() as Pipeline[];

  for (const pipeline of pipelines) {
    const uri = `digest://latest/${pipeline.id}`;
    server.resource(
      `latest-${pipeline.id}`,
      uri,
      { description: `Latest curated digest for ${pipeline.name}`, mimeType: "text/plain" },
      async () => {
        const db = getDb();
        const digest = db.prepare(
          "SELECT * FROM digests WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT 1"
        ).get(pipeline.id) as Digest | undefined;

        if (!digest) {
          return {
            contents: [{ uri, mimeType: "text/plain", text: `No digests yet for ${pipeline.name}.` }],
          };
        }

        const snippets = db.prepare(
          "SELECT * FROM snippets WHERE digest_id = ? ORDER BY position"
        ).all(digest.id) as Snippet[];

        let text = `# ${digest.title}\n`;
        text += `Pipeline: ${pipeline.name} | Created: ${digest.created_at}\n\n`;

        for (const s of snippets) {
          text += `- ${s.key_insight} (${s.source_name})\n`;
        }

        return { contents: [{ uri, mimeType: "text/plain", text }] };
      },
    );
  }

  // Pipeline overview resource
  server.resource(
    "pipelines-overview",
    "digest://pipelines",
    { description: "Overview of all content curation pipelines", mimeType: "text/plain" },
    async () => {
      const db = getDb();
      const rows = db.prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM sources WHERE pipeline_id = p.id) as source_count,
          (SELECT COUNT(*) FROM digests WHERE pipeline_id = p.id) as digest_count,
          (SELECT MAX(created_at) FROM digests WHERE pipeline_id = p.id) as latest_digest
        FROM pipelines p ORDER BY p.name
      `).all() as (Pipeline & { source_count: number; digest_count: number; latest_digest: string | null })[];

      const text = rows.length === 0
        ? "No pipelines configured."
        : rows.map((p) =>
          `**${p.name}** (${p.id})\n` +
          `  Status: ${p.enabled ? "enabled" : "disabled"}\n` +
          `  Sources: ${p.source_count} | Digests: ${p.digest_count}\n` +
          `  Latest digest: ${p.latest_digest || "none"}`
        ).join("\n\n");

      return {
        contents: [{ uri: "digest://pipelines", mimeType: "text/plain", text }],
      };
    },
  );
}
