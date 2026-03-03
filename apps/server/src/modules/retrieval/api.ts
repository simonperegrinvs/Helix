import type { RetrievedContextItem } from "@helix/contracts";
import { randomId } from "@helix/shared-kernel";
import type { DatabaseClient } from "../../shared/infrastructure/database";
import type { AuditDocsApi } from "../audit-docs/api";
import type { VaultApi } from "../vault/api";
import type { WorkspaceApi } from "../workspace/api";

interface RetrieveContextInput {
  projectId: string;
  question: string;
  maxItems: number;
  ingress?: "http" | "mcp";
  actor?: string;
}

interface Chunk {
  heading: string;
  startLine: number;
  endLine: number;
  excerpt: string;
}

export class RetrievalApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly workspaceApi: WorkspaceApi,
    private readonly vaultApi: VaultApi,
    private readonly auditApi: AuditDocsApi,
  ) {}

  async reindexProject(projectId: string): Promise<void> {
    const project = this.workspaceApi.getProject(projectId);
    const markdownFiles = await this.vaultApi.listMarkdownFiles(project.vaultPath);

    this.database.db.query("DELETE FROM retrieval_chunks WHERE project_id = ?1").run(projectId);

    const insert = this.database.db.query(
      `INSERT INTO retrieval_chunks (chunk_id, project_id, file_path, heading, start_line, end_line, excerpt, source_type, confidence)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    );

    for (const relativePath of markdownFiles) {
      const fileText = await this.vaultApi
        .readNote(project.vaultPath, relativePath)
        .catch(() => "");
      const sourceType = this.resolveSourceType(relativePath);
      const chunks = this.chunkMarkdown(fileText);

      for (const chunk of chunks) {
        insert.run(
          randomId("chunk"),
          projectId,
          relativePath,
          chunk.heading,
          chunk.startLine,
          chunk.endLine,
          chunk.excerpt,
          sourceType,
          0.8,
        );
      }
    }

    this.auditApi.recordEvent({
      projectId,
      ingress: "http",
      action: "retrieval.reindex_project",
      actor: "system",
      payload: {
        filesIndexed: markdownFiles.length,
      },
    });
  }

  async retrieveContext(input: RetrieveContextInput): Promise<RetrievedContextItem[]> {
    const queryText = this.toFtsQuery(input.question);

    const rows = this.database.db
      .query(
        `SELECT chunk_id, file_path, heading, start_line, end_line, excerpt, source_type,
                bm25(retrieval_chunks) as score
         FROM retrieval_chunks
         WHERE project_id = ?1 AND retrieval_chunks MATCH ?2
         ORDER BY score ASC
         LIMIT ?3`,
      )
      .all(input.projectId, queryText, input.maxItems) as Array<{
      chunk_id: string;
      file_path: string;
      heading: string;
      start_line: number;
      end_line: number;
      excerpt: string;
      source_type: RetrievedContextItem["sourceType"];
      score: number;
    }>;

    const fallbackRows =
      rows.length > 0
        ? rows
        : (this.database.db
            .query(
              `SELECT chunk_id, file_path, heading, start_line, end_line, excerpt, source_type, 10.0 as score
               FROM retrieval_chunks
               WHERE project_id = ?1 AND excerpt LIKE ?2
               LIMIT ?3`,
            )
            .all(
              input.projectId,
              `%${input.question.slice(0, 40)}%`,
              input.maxItems,
            ) as typeof rows);

    const citations: RetrievedContextItem[] = fallbackRows.map((row) => ({
      chunkId: row.chunk_id,
      filePath: row.file_path,
      heading: row.heading,
      startLine: row.start_line,
      endLine: row.end_line,
      excerpt: row.excerpt,
      sourceType: row.source_type,
      confidence: this.scoreToConfidence(row.score),
    }));

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "retrieval.retrieve_context",
      actor: input.actor ?? "system",
      payload: {
        question: input.question,
        items: citations.length,
      },
    });

    return citations;
  }

  private chunkMarkdown(markdown: string): Chunk[] {
    const lines = markdown.split(/\r?\n/);
    const chunks: Chunk[] = [];

    let currentHeading = "Document";
    let currentStart = 1;
    let buffer: string[] = [];

    const flush = (lineNumber: number): void => {
      const text = buffer.join("\n").trim();
      if (text.length === 0) {
        buffer = [];
        currentStart = lineNumber;
        return;
      }
      chunks.push({
        heading: currentHeading,
        startLine: currentStart,
        endLine: Math.max(currentStart, lineNumber - 1),
        excerpt: text.slice(0, 1200),
      });
      buffer = [];
      currentStart = lineNumber;
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        flush(i + 1);
        currentHeading = (headingMatch[2] ?? "Section").trim();
        currentStart = i + 1;
        continue;
      }

      buffer.push(line);
      if (buffer.join("\n").length >= 700) {
        flush(i + 1);
      }
    }

    flush(lines.length + 1);
    return chunks;
  }

  private toFtsQuery(input: string): string {
    const terms = input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2)
      .slice(0, 6);

    if (terms.length === 0) {
      return "project";
    }

    return terms.map((term) => `${term}*`).join(" OR ");
  }

  private scoreToConfidence(score: number): number {
    if (score <= -5) {
      return 0.95;
    }
    if (score <= 0) {
      return 0.85;
    }
    if (score <= 2) {
      return 0.7;
    }
    return 0.55;
  }

  private resolveSourceType(relativePath: string): RetrievedContextItem["sourceType"] {
    if (relativePath.includes("02-sources/imported-reports")) {
      return "imported_report";
    }
    if (relativePath.includes("04-synthesis")) {
      return "synthesis";
    }
    if (relativePath.includes("03-findings")) {
      return "finding";
    }
    return "project_note";
  }
}
