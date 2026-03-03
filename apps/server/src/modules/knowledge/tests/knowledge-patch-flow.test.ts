import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Citation } from "@helix/contracts";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "../../../shared/testing/test-helpers";

describe("Knowledge patch and synthesis flow", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext("knowledge");
    const project = await ctx.container.workspaceApi.createProject({
      name: "Knowledge Project",
      ingress: "http",
      actor: "test",
    });
    projectId = project.projectId;
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("creates synthesis, registers evidence-backed finding, and applies approved patch", async () => {
    const synthesis = await ctx.container.knowledgeApi.getSynthesis(projectId);
    expect(synthesis.doc.version).toBe(1);

    const updated = await ctx.container.knowledgeApi.updateSynthesis({
      projectId,
      content: "# Current Synthesis\n\nEvidence-backed summary.",
      confidence: 0.72,
      ingress: "http",
      actor: "test",
    });
    expect(updated.version).toBe(2);

    const citations: Citation[] = [
      {
        filePath: "04-synthesis/current-synthesis.md",
        heading: "Current Synthesis",
        startLine: 1,
        endLine: 2,
        excerpt: "Evidence-backed summary.",
        sourceType: "synthesis",
        confidence: 0.8,
      },
    ];

    const finding = ctx.container.knowledgeApi.registerFinding({
      projectId,
      statement: "The project has at least one evidence-backed statement.",
      status: "supported",
      citations,
      ingress: "http",
      actor: "test",
    });
    expect(finding.findingId.length).toBeGreaterThan(10);

    const proposal = await ctx.container.knowledgeApi.proposePatch({
      projectId,
      targetPath: "04-synthesis/current-synthesis.md",
      proposedContent: "# Current Synthesis\n\nPatched content from proposal.",
      ingress: "http",
      actor: "test",
    });
    expect(proposal.diff).toContain("Patched content");

    const token = await ctx.container.knowledgeApi.createApprovalToken(
      projectId,
      "knowledge.apply_patch",
      5,
    );

    const applied = await ctx.container.knowledgeApi.applyPatch({
      projectId,
      proposalId: proposal.proposalId,
      approvalToken: token,
      ingress: "http",
      actor: "test",
    });
    expect(applied.applied).toBe(true);

    await expect(
      ctx.container.knowledgeApi.applyPatch({
        projectId,
        proposalId: proposal.proposalId,
        approvalToken: token,
      }),
    ).rejects.toThrow();

    const evidence = ctx.container.knowledgeApi.listEvidence(projectId);
    expect(evidence.some((item) => item.type === "finding")).toBe(true);
  });

  test("rejects disallowed patch target", async () => {
    await expect(
      ctx.container.knowledgeApi.proposePatch({
        projectId,
        targetPath: "07-attachments/file.bin",
        proposedContent: "bad",
      }),
    ).rejects.toThrow();
  });

  test("rejects oversized patch content", async () => {
    await expect(
      ctx.container.knowledgeApi.proposePatch({
        projectId,
        targetPath: "04-synthesis/current-synthesis.md",
        proposedContent: "x".repeat(1_200_000),
      }),
    ).rejects.toThrow();
  });

  test("generates finding and synthesis drafts for review workflows", async () => {
    const seededFinding = ctx.container.knowledgeApi.registerFinding({
      projectId,
      statement: "Battery storage deployment is accelerating.",
      status: "tentative",
      citations: [
        {
          filePath: "04-synthesis/current-synthesis.md",
          heading: "Current Synthesis",
          startLine: 1,
          endLine: 2,
          excerpt: "Evidence-backed summary.",
          sourceType: "synthesis",
          confidence: 0.8,
        },
      ],
      ingress: "http",
      actor: "test",
    });

    const findingsDraft = await ctx.container.knowledgeApi.draftFindings({
      projectId,
      maxItems: 3,
      ingress: "http",
      actor: "test",
    });
    expect(findingsDraft.generatedBy).toBe("codex");
    expect(findingsDraft.suggestions.length).toBeGreaterThan(0);

    const synthesisDraft = await ctx.container.knowledgeApi.draftSynthesis({
      projectId,
      selectedFindingIds: [seededFinding.findingId],
      ingress: "http",
      actor: "test",
    });
    expect(synthesisDraft.generatedBy).toBe("codex");
    expect(synthesisDraft.content).toContain("# Current Synthesis");
  });
});
