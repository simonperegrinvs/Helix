import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { ImportedReport } from "@helix/contracts";
import { DomainError, nowIso, randomId } from "@helix/shared-kernel";
import type { DatabaseClient } from "../../shared/infrastructure/database";
import type { AuditDocsApi } from "../audit-docs/api";
import type { RetrievalApi } from "../retrieval/api";
import type { VaultApi } from "../vault/api";
import type { WorkspaceApi } from "../workspace/api";

export interface ImportReportInput {
  projectId: string;
  sourceType: string;
  originalFilename: string;
  content?: string;
  sourcePath?: string;
  actor?: string;
  ingress?: "http" | "mcp";
}

export interface ReportContentView {
  report: ImportedReport;
  normalizedContent: string;
}
const MAX_IMPORT_BYTES = Number(process.env.HELIX_MAX_IMPORT_BYTES ?? 10_000_000);
const ALLOWED_IMPORT_EXTENSIONS = new Set([".md", ".txt", ".pdf"]);

export class ReportImportApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly workspaceApi: WorkspaceApi,
    private readonly vaultApi: VaultApi,
    private readonly retrievalApi: RetrievalApi,
    private readonly auditApi: AuditDocsApi,
  ) {}

  async importReport(input: ImportReportInput): Promise<ImportedReport> {
    const project = this.workspaceApi.getProject(input.projectId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportId = randomId("report");
    const extension = extname(input.originalFilename).toLowerCase();
    if (!ALLOWED_IMPORT_EXTENSIONS.has(extension)) {
      throw new DomainError(
        `Unsupported report format: ${extension || "<none>"}`,
        "REPORT_IMPORT_UNSUPPORTED_FORMAT",
      );
    }
    const fileBase = `${timestamp}-${reportId}-${input.originalFilename}`;

    const originalRelativePath = join("02-sources", "imported-reports", "original", fileBase);
    const normalizedRelativePath = join(
      "02-sources",
      "imported-reports",
      "normalized",
      `${fileBase}.md`,
    );

    const originalAbsolutePath = this.vaultApi.resolveSafePath(
      project.vaultPath,
      originalRelativePath,
    );
    const normalizedAbsolutePath = this.vaultApi.resolveSafePath(
      project.vaultPath,
      normalizedRelativePath,
    );

    await mkdir(dirname(originalAbsolutePath), { recursive: true });
    await mkdir(dirname(normalizedAbsolutePath), { recursive: true });

    let originalBytes: Uint8Array;
    if (input.sourcePath) {
      originalBytes = await readFile(input.sourcePath);
      await cp(input.sourcePath, originalAbsolutePath);
    } else {
      originalBytes = Buffer.from(input.content ?? "", "utf8");
      await writeFile(originalAbsolutePath, originalBytes);
    }
    if (originalBytes.byteLength > MAX_IMPORT_BYTES) {
      throw new DomainError(
        `Imported report exceeds size limit (${MAX_IMPORT_BYTES} bytes)`,
        "REPORT_IMPORT_TOO_LARGE",
      );
    }

    const normalized = await this.normalizeContent({
      extension,
      bytes: originalBytes,
      originalFilename: input.originalFilename,
      originalRelativePath,
      originalAbsolutePath,
    });

    await this.vaultApi.writeNote(project.vaultPath, normalizedRelativePath, normalized.content);

    const importedAt = nowIso();
    const report: ImportedReport = {
      reportId,
      projectId: input.projectId,
      sourceType: input.sourceType,
      originalFilename: input.originalFilename,
      originalPath: originalRelativePath,
      normalizedPath: normalizedRelativePath,
      importedAt,
      metadata: {
        extension,
        extraction: normalized.method,
        byteLength: originalBytes.byteLength,
        title: normalized.title,
      },
    };

    this.database.db
      .query(
        `INSERT INTO imported_reports (
          report_id, project_id, source_type, original_filename, original_path, normalized_path, imported_at, metadata_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .run(
        report.reportId,
        report.projectId,
        report.sourceType,
        report.originalFilename,
        report.originalPath,
        report.normalizedPath,
        report.importedAt,
        JSON.stringify(report.metadata),
      );

    await this.retrievalApi.reindexProject(input.projectId);

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "report_import.import_report",
      actor: input.actor ?? "system",
      payload: {
        reportId,
        originalFilename: input.originalFilename,
        normalizedPath: normalizedRelativePath,
      },
    });

    return report;
  }

  listReports(projectId: string): ImportedReport[] {
    const rows = this.database.db
      .query(
        `SELECT report_id, project_id, source_type, original_filename, original_path, normalized_path, imported_at, metadata_json
         FROM imported_reports WHERE project_id = ?1 ORDER BY imported_at DESC`,
      )
      .all(projectId) as Array<{
      report_id: string;
      project_id: string;
      source_type: string;
      original_filename: string;
      original_path: string;
      normalized_path: string;
      imported_at: string;
      metadata_json: string;
    }>;

    return rows.map((row) => ({
      reportId: row.report_id,
      projectId: row.project_id,
      sourceType: row.source_type,
      originalFilename: row.original_filename,
      originalPath: row.original_path,
      normalizedPath: row.normalized_path,
      importedAt: row.imported_at,
      metadata: JSON.parse(row.metadata_json),
    }));
  }

  getReport(projectId: string, reportId: string): ImportedReport {
    const row = this.database.db
      .query(
        `SELECT report_id, project_id, source_type, original_filename, original_path, normalized_path, imported_at, metadata_json
         FROM imported_reports WHERE project_id = ?1 AND report_id = ?2`,
      )
      .get(projectId, reportId) as {
      report_id: string;
      project_id: string;
      source_type: string;
      original_filename: string;
      original_path: string;
      normalized_path: string;
      imported_at: string;
      metadata_json: string;
    } | null;

    if (!row) {
      throw new DomainError(`Report not found: ${reportId}`, "REPORT_NOT_FOUND");
    }

    return {
      reportId: row.report_id,
      projectId: row.project_id,
      sourceType: row.source_type,
      originalFilename: row.original_filename,
      originalPath: row.original_path,
      normalizedPath: row.normalized_path,
      importedAt: row.imported_at,
      metadata: JSON.parse(row.metadata_json),
    };
  }

  async getReportContent(projectId: string, reportId: string): Promise<ReportContentView> {
    const report = this.getReport(projectId, reportId);
    const project = this.workspaceApi.getProject(projectId);
    const normalizedContent = await this.vaultApi.readNote(
      project.vaultPath,
      report.normalizedPath,
    );
    return {
      report,
      normalizedContent,
    };
  }

  private async normalizeContent(input: {
    extension: string;
    bytes: Uint8Array;
    originalFilename: string;
    originalRelativePath: string;
    originalAbsolutePath: string;
  }): Promise<{ title: string; content: string; method: string }> {
    const rawText = Buffer.from(input.bytes).toString("utf8");

    if (input.extension === ".md") {
      return {
        title: input.originalFilename,
        method: "markdown_passthrough",
        content: rawText,
      };
    }

    if (input.extension === ".txt") {
      return {
        title: input.originalFilename,
        method: "plaintext_to_markdown",
        content: `# ${input.originalFilename}\n\n${rawText.trim()}\n`,
      };
    }

    if (input.extension === ".pdf") {
      const extraction = Bun.spawnSync(
        [
          "/bin/sh",
          "-lc",
          `command -v pdftotext >/dev/null && pdftotext \"${input.originalAbsolutePath}\" -`,
        ],
        {
          cwd: process.cwd(),
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      if (extraction.exitCode === 0 && extraction.stdout.length > 0) {
        const extractedText = Buffer.from(extraction.stdout).toString("utf8").trim();
        return {
          title: input.originalFilename,
          method: "pdftotext",
          content: `# ${input.originalFilename}\n\n${extractedText}\n`,
        };
      }

      return {
        title: input.originalFilename,
        method: "pdf_fallback_placeholder",
        content: `# ${input.originalFilename}\n\nPDF report imported.\n\nExtraction unavailable in this runtime.\n\nOriginal file: ${input.originalRelativePath}\n`,
      };
    }

    return {
      title: input.originalFilename,
      method: "binary_fallback",
      content: `# ${input.originalFilename}\n\nImported file could not be normalized automatically.\n\nOriginal file: ${input.originalRelativePath}\n`,
    };
  }
}
