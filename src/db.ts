import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { config } from "./config.js";
import type { PipelineConfig } from "./types.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.resolve(config.dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      index_url TEXT,
      curation_prompt TEXT NOT NULL,
      max_snippets INTEGER NOT NULL DEFAULT 3,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      feed_url TEXT,
      feed_type TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetched_at TEXT,
      UNIQUE(pipeline_id, url)
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT,
      published_at TEXT,
      content TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snippets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_id INTEGER NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
      key_insight TEXT NOT NULL,
      source_article_id INTEGER REFERENCES articles(id),
      source_url TEXT NOT NULL,
      source_name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      is_fresh INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS daily_directions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      focus_angle TEXT NOT NULL,
      suggestions TEXT NOT NULL,
      context_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS direction_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction_id INTEGER NOT NULL REFERENCES daily_directions(id),
      suggestion_index INTEGER NOT NULL,
      reaction TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS writing_cache (
      url TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deleted_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id TEXT NOT NULL,
      pipeline_name TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      feed_url TEXT,
      feed_type TEXT,
      auto_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sources_pipeline_id ON sources(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_articles_source_id ON articles(source_id);
    CREATE INDEX IF NOT EXISTS idx_articles_fetched_at ON articles(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_digests_pipeline_id ON digests(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_snippets_digest_id ON snippets(digest_id);
    CREATE INDEX IF NOT EXISTS idx_direction_feedback_direction_id ON direction_feedback(direction_id);
    CREATE INDEX IF NOT EXISTS idx_snippets_source_article_id ON snippets(source_article_id);
    CREATE INDEX IF NOT EXISTS idx_digests_pipeline_created ON digests(pipeline_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_direction_feedback_created_at ON direction_feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_deleted_sources_deleted_at ON deleted_sources(deleted_at);
  `);

  // Migrations — add columns that may not exist on older databases
  const hasIsFresh = db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('snippets') WHERE name = 'is_fresh'"
  ).get() as { c: number };
  if (hasIsFresh.c === 0) {
    db.exec("ALTER TABLE snippets ADD COLUMN is_fresh INTEGER NOT NULL DEFAULT 1");
  }

  const hasInputTokens = db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('daily_directions') WHERE name = 'input_tokens'"
  ).get() as { c: number };
  if (hasInputTokens.c === 0) {
    db.exec("ALTER TABLE daily_directions ADD COLUMN input_tokens INTEGER");
    db.exec("ALTER TABLE daily_directions ADD COLUMN output_tokens INTEGER");
  }

  const hasModelUsed = db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('daily_directions') WHERE name = 'model_used'"
  ).get() as { c: number };
  if (hasModelUsed.c === 0) {
    db.exec("ALTER TABLE daily_directions ADD COLUMN model_used TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // FTS table — created separately since virtual tables don't support IF NOT EXISTS in all builds
  const ftsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='snippets_fts'"
  ).get();

  if (!ftsExists) {
    db.exec(`
      CREATE VIRTUAL TABLE snippets_fts USING fts5(
        key_insight,
        content='snippets', content_rowid='id'
      );

      CREATE TRIGGER snippets_ai AFTER INSERT ON snippets BEGIN
        INSERT INTO snippets_fts(rowid, key_insight)
        VALUES (new.id, new.key_insight);
      END;

      CREATE TRIGGER snippets_ad AFTER DELETE ON snippets BEGIN
        INSERT INTO snippets_fts(snippets_fts, rowid, key_insight)
        VALUES ('delete', old.id, old.key_insight);
      END;

      CREATE TRIGGER snippets_au AFTER UPDATE ON snippets BEGIN
        INSERT INTO snippets_fts(snippets_fts, rowid, key_insight)
        VALUES ('delete', old.id, old.key_insight);
        INSERT INTO snippets_fts(rowid, key_insight)
        VALUES (new.id, new.key_insight);
      END;
    `);
  }
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null): void {
  const db = getDb();
  if (value === null) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  } else {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }
}

/**
 * One-time data migrations that must run after upsertPipelines (new pipeline rows must exist first).
 * Guarded by settings flags so they only execute once.
 */
export function runDataMigrations(): void {
  const db = getDb();

  // Migration: rename substack-* pipelines, split ai-thoughts out of ai-news
  if (!getSetting("migration_pipeline_rename_2026_03")) {
    db.transaction(() => {
      // Rename substack-* → unprefixed ids (new pipeline rows already created by upsertPipelines)
      for (const [oldId, newId] of [
        ["substack-culture", "culture"],
        ["substack-design-tech", "design-tech"],
        ["substack-fiction", "fiction"],
      ] as [string, string][]) {
        db.prepare("UPDATE sources SET pipeline_id = ? WHERE pipeline_id = ?").run(newId, oldId);
        db.prepare("UPDATE digests SET pipeline_id = ? WHERE pipeline_id = ?").run(newId, oldId);
        db.prepare("DELETE FROM pipelines WHERE id = ?").run(oldId);
      }

      // Move sources from ai-news → ai-thoughts
      const toAiThoughts = [
        "https://every.to/",
        "https://www.oneusefulthing.org",
        "https://strefatech.substack.com",
        "https://felixhhaas.substack.com",
        "https://zerovector.substack.com",
      ];
      const placeholders = toAiThoughts.map(() => "?").join(",");
      db.prepare(`UPDATE sources SET pipeline_id = 'ai-thoughts' WHERE url IN (${placeholders})`).run(...toAiThoughts);

      // Move Knapsack Blog from ai-news → design-tech
      db.prepare("UPDATE sources SET pipeline_id = 'design-tech' WHERE url = ?").run("https://www.knapsack.cloud/blog");

      setSetting("migration_pipeline_rename_2026_03", "done");
    })();
    console.error("[migration] pipeline_rename_2026_03 complete");
  }
}

export function upsertPipelines(configs: PipelineConfig[]): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO pipelines (id, name, index_url, curation_prompt, max_snippets)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      index_url = excluded.index_url,
      curation_prompt = excluded.curation_prompt,
      max_snippets = excluded.max_snippets
  `);

  const tx = db.transaction(() => {
    for (const c of configs) {
      upsert.run(c.id, c.name, c.index_url || null, c.curation_prompt, c.max_snippets);
    }
  });
  tx();
}
