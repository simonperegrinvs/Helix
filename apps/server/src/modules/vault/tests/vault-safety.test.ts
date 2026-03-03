import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Vault safety and I/O", () => {
  let ctx: TestContext;
  let projectId: string;
  let vaultPath: string;

  beforeAll(async () => {
    ctx = await createTestContext("vault-safety");
    const project = await ctx.container.workspaceApi.createProject({
      name: "Vault Safety",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
    vaultPath = project.vaultPath;
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("writes, appends, lists markdown, and blocks path escapes", async () => {
    await ctx.container.vaultApi.writeNote(
      vaultPath,
      "04-synthesis/current-synthesis.md",
      "# S\n\nA\n",
    );
    await ctx.container.vaultApi.appendSection(
      vaultPath,
      "04-synthesis/current-synthesis.md",
      "## Added\n\nMore content",
    );

    const synthesis = await ctx.container.vaultApi.readNote(
      vaultPath,
      "04-synthesis/current-synthesis.md",
    );
    expect(synthesis).toContain("Added");

    const tree = await ctx.container.vaultApi.readProjectTree(vaultPath);
    expect(tree.type).toBe("directory");

    const files = await ctx.container.vaultApi.listMarkdownFiles(vaultPath);
    expect(files.length).toBeGreaterThan(0);

    expect(() => ctx.container.vaultApi.resolveSafePath(vaultPath, "../../etc/passwd")).toThrow();

    await expect(ctx.container.retrievalApi.reindexProject(projectId)).resolves.toBeUndefined();
  });

  test("enforces note size safety limit", async () => {
    const huge = "x".repeat(1_200_000);
    await expect(
      ctx.container.vaultApi.writeNote(vaultPath, "00-project/project.md", huge),
    ).rejects.toThrow();
  });
});
