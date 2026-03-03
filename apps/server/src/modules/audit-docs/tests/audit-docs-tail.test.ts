import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Audit docs", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("audit");
    const project = await ctx.container.workspaceApi.createProject({
      name: "Audit Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("records and tails correlated events", () => {
    const first = ctx.container.auditApi.recordEvent({
      projectId,
      ingress: "http",
      action: "custom.action",
      actor: "test",
      payload: { ok: true },
      correlationId: "corr_1",
    });

    expect(first.correlationId).toBe("corr_1");

    const events = ctx.container.auditApi.tailEvents(projectId, 10);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.projectId).toBe(projectId);
  });
});
