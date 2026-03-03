import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Workspace lifecycle", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext("workspace-lifecycle");
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("creates, lists, reads, attaches, and computes overview", async () => {
    const project = await ctx.container.workspaceApi.createProject({
      name: "Energy Transition Tracker",
      ingress: "http",
      actor: "test",
    });

    const listed = ctx.container.workspaceApi.listProjects();
    expect(listed.some((item) => item.projectId === project.projectId)).toBe(true);

    const fetched = ctx.container.workspaceApi.getProject(project.projectId);
    expect(fetched.slug).toContain("energy-transition-tracker");

    const newVault = await mkdtemp(join(tmpdir(), "helix-attach-"));
    const attached = await ctx.container.workspaceApi.attachVaultFolder({
      projectId: project.projectId,
      vaultPath: newVault,
      ingress: "http",
      actor: "test",
    });
    expect(attached.vaultPath).toBe(newVault);

    const overview = ctx.container.workspaceApi.getProjectOverview(project.projectId);
    expect(overview.project.projectId).toBe(project.projectId);
    expect(overview.stats.reports).toBe(0);
  });
});
