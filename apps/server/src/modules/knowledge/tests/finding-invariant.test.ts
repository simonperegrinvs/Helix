import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Finding invariant", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("finding-invariant");
    const project = await ctx.container.workspaceApi.createProject({
      name: "Invariant Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("rejects non-hypothesis finding without citations", () => {
    expect(() =>
      ctx.container.knowledgeApi.registerFinding({
        projectId,
        statement: "Claim without evidence",
        status: "tentative",
        citations: [],
      }),
    ).toThrow();
  });

  test("accepts hypothesis finding without citations", () => {
    const finding = ctx.container.knowledgeApi.registerFinding({
      projectId,
      statement: "Hypothesis candidate",
      status: "tentative",
      citations: [],
      isHypothesis: true,
    });

    expect(finding.isHypothesis).toBe(true);
  });
});
