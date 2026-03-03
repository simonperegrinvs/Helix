import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface DbConfig {
  path: string;
}

export const defaultDbPath = (): string =>
  process.env.HELIX_DB_PATH ?? `${process.cwd()}/apps/server/data/helix.sqlite`;

export class DatabaseClient {
  readonly db: Database;

  constructor(config: DbConfig) {
    mkdirSync(dirname(config.path), { recursive: true });
    this.db = new Database(config.path, { create: true, strict: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        vault_path TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        settings_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS research_threads (
        thread_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        last_turn_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS imported_reports (
        report_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        original_path TEXT NOT NULL,
        normalized_path TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS findings (
        finding_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        statement TEXT NOT NULL,
        status TEXT NOT NULL,
        is_hypothesis INTEGER NOT NULL,
        citations_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS synthesis_documents (
        project_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        summary_path TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        confidence REAL NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS external_query_drafts (
        query_draft_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        query_text TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        expected_output_shape_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        ingress TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approval_tokens (
        token TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        action TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS patch_proposals (
        proposal_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        target_path TEXT NOT NULL,
        proposed_content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        applied_at TEXT
      );

      CREATE TABLE IF NOT EXISTS conversation_turns (
        turn_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        question TEXT NOT NULL,
        response TEXT NOT NULL,
        citations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES research_threads(thread_id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS retrieval_chunks USING fts5(
        chunk_id,
        project_id UNINDEXED,
        file_path UNINDEXED,
        heading,
        start_line UNINDEXED,
        end_line UNINDEXED,
        excerpt,
        source_type UNINDEXED,
        confidence UNINDEXED
      );
    `);
  }
}
