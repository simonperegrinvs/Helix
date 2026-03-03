import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("MCP interface tools", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("mcp-interface");
    const project = await ctx.container.workspaceApi.createProject({
      name: "MCP Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;

    await ctx.container.reportImportApi.importReport({
      projectId,
      sourceType: "manual",
      originalFilename: "seed.md",
      content: "# Seed\n\nMCP retrieval seed content.",
      ingress: "http",
      actor: "test",
    });
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("exposes required tool surface", () => {
    const tools = ctx.container.mcpInterfaceApi.listTools();
    expect(tools.some((tool) => tool.name === "project.search")).toBe(true);
    expect(tools.some((tool) => tool.name === "knowledge.apply_patch")).toBe(true);
    expect(tools.some((tool) => tool.name === "external_query.trigger")).toBe(true);
  });

  test("handles read and write tools through shared services", async () => {
    const projects = await ctx.container.mcpInterfaceApi.handleToolCall({
      name: "projects.list",
      args: {},
      actor: "mcp-test",
    });
    expect(Array.isArray(projects)).toBe(true);

    const search = (await ctx.container.mcpInterfaceApi.handleToolCall({
      name: "project.search",
      args: { projectId, question: "seed", maxItems: 5 },
      actor: "mcp-test",
    })) as Array<{ filePath: string }>;
    expect(search.length).toBeGreaterThan(0);

    const draft = (await ctx.container.mcpInterfaceApi.handleToolCall({
      name: "external_query.draft",
      args: { projectId, goal: "Find new references" },
      actor: "mcp-test",
    })) as { queryDraftId: string };

    const trigger = (await ctx.container.mcpInterfaceApi.handleToolCall({
      name: "external_query.trigger",
      args: { projectId, queryDraftId: draft.queryDraftId },
      actor: "mcp-test",
    })) as { accepted: boolean };

    expect(trigger.accepted).toBe(true);
  });

  test("rejects calls missing projectId where required", async () => {
    await expect(
      ctx.container.mcpInterfaceApi.handleToolCall({
        name: "project.search",
        args: { question: "missing id" },
      }),
    ).rejects.toThrow();
  });
});
