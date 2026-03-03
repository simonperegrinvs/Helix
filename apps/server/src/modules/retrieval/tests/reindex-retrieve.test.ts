import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Retrieval reindex and query", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("retrieval");
    const project = await ctx.container.workspaceApi.createProject({
      name: "Retrieval Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
    await ctx.container.vaultApi.writeNote(
      project.vaultPath,
      "03-findings/findings.md",
      "# Findings\n\n## Carbon Capture\n\nCarbon capture has mixed evidence and cost tradeoffs.\n",
    );
    await ctx.container.retrievalApi.reindexProject(projectId);
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("returns citations tied to project files", async () => {
    const results = await ctx.container.retrievalApi.retrieveContext({
      projectId,
      question: "carbon capture tradeoffs",
      maxItems: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.filePath).toContain("03-findings/findings.md");
  });

  test("caps maxItems to safety bound", async () => {
    const results = await ctx.container.retrievalApi.retrieveContext({
      projectId,
      question: "carbon",
      maxItems: 500,
    });
    expect(results.length).toBeLessThanOrEqual(25);
  });
});
