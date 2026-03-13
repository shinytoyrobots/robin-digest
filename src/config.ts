import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { PipelineConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export const config = {
  dbPath: process.env.DB_PATH || "./data/digest.db",
  httpPort: parseInt(process.env.PORT || process.env.HTTP_PORT || "3002", 10),
  authToken: process.env.AUTH_TOKEN || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  claudeModel: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",
  pipelinesDir: process.env.PIPELINES_DIR || "./pipelines",
  userAgent: process.env.USER_AGENT || "RobinDigest/1.0",
  fetchTimeoutMs: parseInt(process.env.FETCH_TIMEOUT_MS || "15000", 10),
  cronSchedule: process.env.CRON_SCHEDULE || "0 3 * * *",
  cronTimezone: process.env.CRON_TIMEZONE || "America/Chicago",
  robinMcpUrl: process.env.ROBIN_MCP_URL || "http://localhost:3001",
  robinMcpToken: process.env.ROBIN_MCP_TOKEN || "",
  directionCron: process.env.DIRECTION_CRON || "30 3 * * *",
  githubToken: process.env.GITHUB_TOKEN || "",
  directionModel: process.env.DIRECTION_MODEL || "claude-sonnet-4-6",
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || "",
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
};

export function loadPipelineConfigs(): PipelineConfig[] {
  const dir = path.resolve(config.pipelinesDir);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8");
      const parsed = yaml.load(raw) as PipelineConfig;
      return parsed;
    });
}
