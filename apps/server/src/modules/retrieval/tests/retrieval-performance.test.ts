import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { performance } from "node:perf_hooks";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Retrieval performance guard", () => {
  let ctx: TestContext;
  let projectId: string;
  let vaultPath: string;

  beforeAll(async () => {
    ctx = await createTestContext("retrieval-performance");
    const project = await ctx.container.workspaceApi.createProject({
      name: "Performance Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
    vaultPath = project.vaultPath;

    for (let index = 0; index < 40; index += 1) {
      await ctx.container.vaultApi.writeNote(
        vaultPath,
        `02-sources/manual-notes/note-${index}.md`,
        `# Note ${index}\n\nBattery supply-chain evidence ${index} with references and contradictions.\n`,
      );
    }
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("reindex and retrieval stay within practical local limits", async () => {
    const startReindex = performance.now();
    await ctx.container.retrievalApi.reindexProject(projectId);
    const reindexMs = performance.now() - startReindex;

    const startRetrieve = performance.now();
    const results = await ctx.container.retrievalApi.retrieveContext({
      projectId,
      question: "battery supply chain references",
      maxItems: 10,
      ingress: "http",
      actor: "test",
    });
    const retrieveMs = performance.now() - startRetrieve;

    expect(results.length).toBeGreaterThan(0);
    expect(reindexMs).toBeLessThan(3_000);
    expect(retrieveMs).toBeLessThan(1_000);
  });
});
