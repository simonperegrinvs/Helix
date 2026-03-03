import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Report import flow", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("report-import");
    const project = await ctx.container.workspaceApi.createProject({
      name: "Import Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("imports markdown, text, and path-based report and indexes content", async () => {
    const md = await ctx.container.reportImportApi.importReport({
      projectId,
      sourceType: "manual",
      originalFilename: "analysis.md",
      content: "# Analysis\n\nClaim about volatility.",
      ingress: "http",
      actor: "test",
    });
    expect(md.normalizedPath.endsWith(".md.md")).toBe(true);

    const txt = await ctx.container.reportImportApi.importReport({
      projectId,
      sourceType: "manual",
      originalFilename: "notes.txt",
      content: "Plain-text evidence and references.",
      ingress: "http",
      actor: "test",
    });
    expect(txt.metadata.extraction).toBe("plaintext_to_markdown");

    const sourcePath = join(ctx.root, "sample.md");
    await writeFile(sourcePath, "# Sample\n\nSource path import.", "utf8");
    const pathImport = await ctx.container.reportImportApi.importReport({
      projectId,
      sourceType: "manual",
      originalFilename: "sample.md",
      sourcePath,
      ingress: "http",
      actor: "test",
    });
    expect(pathImport.originalPath).toContain("02-sources/imported-reports/original");

    const listed = ctx.container.reportImportApi.listReports(projectId);
    expect(listed.length).toBeGreaterThanOrEqual(3);

    const fetched = ctx.container.reportImportApi.getReport(projectId, md.reportId);
    expect(fetched.reportId).toBe(md.reportId);
    const contentView = await ctx.container.reportImportApi.getReportContent(
      projectId,
      md.reportId,
    );
    expect(contentView.normalizedContent).toContain("Claim about volatility");

    const retrieved = await ctx.container.retrievalApi.retrieveContext({
      projectId,
      question: "volatility references",
      maxItems: 10,
      ingress: "http",
      actor: "test",
    });
    expect(retrieved.length).toBeGreaterThan(0);
  });

  test("rejects unsupported report formats", async () => {
    await expect(
      ctx.container.reportImportApi.importReport({
        projectId,
        sourceType: "manual",
        originalFilename: "bad.csv",
        content: "a,b,c",
      }),
    ).rejects.toThrow();
  });

  test("rejects oversized report payloads", async () => {
    await expect(
      ctx.container.reportImportApi.importReport({
        projectId,
        sourceType: "manual",
        originalFilename: "huge.txt",
        content: "a".repeat(10_500_000),
      }),
    ).rejects.toThrow();
  });
});
