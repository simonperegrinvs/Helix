import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("MCP tool schema contracts", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("mcp-contract");
    const project = await ctx.container.workspaceApi.createProject({
      name: "MCP Contract Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("tool list includes required v1 names", () => {
    const names = ctx.container.mcpInterfaceApi.listTools().map((tool) => tool.name);

    const expected = [
      "projects.list",
      "projects.get_manifest",
      "projects.get_overview",
      "project.search",
      "project.get_synthesis",
      "reports.list",
      "reports.get",
      "audit.tail",
      "external_query.draft",
      "external_query.trigger",
      "import_report.register",
      "knowledge.propose_patch",
      "knowledge.apply_patch",
    ];

    for (const name of expected) {
      expect(names.includes(name)).toBe(true);
    }
  });

  test("mutating apply_patch fails closed without approval token", async () => {
    await expect(
      ctx.container.mcpInterfaceApi.handleToolCall({
        name: "knowledge.apply_patch",
        args: {
          projectId,
          proposalId: "patch_missing",
          approval_token: "invalid",
        },
        actor: "contract-test",
      }),
    ).rejects.toThrow();
  });
});
