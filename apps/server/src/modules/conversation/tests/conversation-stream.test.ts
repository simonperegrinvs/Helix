import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Conversation stream", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("conversation");
    const project = await ctx.container.workspaceApi.createProject({
      name: "Conversation Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
    await ctx.container.retrievalApi.reindexProject(projectId);
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("streams and persists a turn", async () => {
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of ctx.container.conversationApi.streamTurn({
      projectId,
      question: "What should we investigate next?",
      ingress: "http",
      actor: "test",
    })) {
      if (event.type === "token") {
        events.push({ type: event.type, text: event.text });
      } else {
        events.push({ type: event.type });
      }
    }

    expect(events.some((event) => event.type === "token")).toBe(true);

    const threads = ctx.container.conversationApi.listThreads(projectId);
    expect(threads.length).toBeGreaterThan(0);
  });
});
