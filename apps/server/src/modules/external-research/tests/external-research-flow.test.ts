import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("External research flow", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("external");
    const project = await ctx.container.workspaceApi.createProject({
      name: "External Loop",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;

    await ctx.container.reportImportApi.importReport({
      projectId,
      sourceType: "manual",
      originalFilename: "seed.md",
      content: "# Seed\n\nResearch baseline concepts and references.",
      ingress: "http",
      actor: "test",
    });
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("drafts, lists, and triggers query packages", async () => {
    const draft = await ctx.container.externalResearchApi.draftResearchQuery({
      projectId,
      goal: "Find contradictory evidence",
      userRequest: "focus on standards",
      ingress: "http",
      actor: "test",
    });

    expect(draft.queryText).toContain("primaryTerms");

    const listed = ctx.container.externalResearchApi.listDrafts(projectId);
    expect(listed.some((item) => item.queryDraftId === draft.queryDraftId)).toBe(true);

    const run = await ctx.container.externalResearchApi.triggerTool({
      projectId,
      queryDraftId: draft.queryDraftId,
      ingress: "http",
      actor: "test",
    });

    expect(run.accepted).toBe(true);
    expect(run.mode).toBe("manual");
  });

  test("throws on missing draft trigger", async () => {
    await expect(
      ctx.container.externalResearchApi.triggerTool({
        projectId,
        queryDraftId: "query_missing",
      }),
    ).rejects.toThrow();
  });

  test("streams external query drafting progress events", async () => {
    const events: string[] = [];
    let draftId = "";

    for await (const event of ctx.container.externalResearchApi.streamDraftResearchQuery({
      projectId,
      goal: "Collect contradictory sources",
      ingress: "http",
      actor: "test",
    })) {
      events.push(event.type);
      if (event.type === "done") {
        draftId = event.result.draft.queryDraftId;
      }
    }

    expect(events.includes("stage")).toBe(true);
    expect(events.includes("token")).toBe(true);
    expect(events.includes("done")).toBe(true);
    expect(draftId.length).toBeGreaterThan(0);
  });
});
