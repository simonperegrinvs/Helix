import type { ExternalResearchQueryDraft } from "@helix/contracts";
import { nowIso, randomId } from "@helix/shared-kernel";
import type { DatabaseClient } from "../../shared/infrastructure/database";
import type { AuditDocsApi } from "../audit-docs/api";
import type { CodexGateway } from "../conversation/application/codex-gateway";
import type { KnowledgeApi } from "../knowledge/api";
import type { RetrievalApi } from "../retrieval/api";
import type { VaultApi } from "../vault/api";
import type { WorkspaceApi } from "../workspace/api";
import type { ExternalResearchToolPort } from "./application/external-research-tool-port";

export interface ExternalResearchRunResult {
  mode: "manual" | "http";
  queryDraftId: string;
  runId: string;
  accepted: boolean;
  payload: Record<string, unknown>;
}

export class ExternalResearchApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly workspaceApi: WorkspaceApi,
    private readonly retrievalApi: RetrievalApi,
    private readonly knowledgeApi: KnowledgeApi,
    private readonly vaultApi: VaultApi,
    private readonly codexGateway: CodexGateway,
    private readonly auditApi: AuditDocsApi,
    private readonly externalToolPort: ExternalResearchToolPort,
  ) {}

  async draftResearchQuery(input: {
    projectId: string;
    goal: string;
    userRequest?: string;
    ingress?: "http" | "mcp";
    actor?: string;
  }): Promise<ExternalResearchQueryDraft> {
    const project = this.workspaceApi.getProject(input.projectId);
    const openQuestions = await this.vaultApi.readNote(
      project.vaultPath,
      "01-questions/open-questions.md",
    );
    const synthesis = await this.knowledgeApi.getSynthesis(input.projectId);
    const supportingContext = await this.retrievalApi.retrieveContext({
      projectId: input.projectId,
      question: input.goal,
      maxItems: 5,
      ingress: input.ingress,
      actor: input.actor,
    });

    const conceptVariants = this.extractConceptVariants(`${openQuestions}\n${synthesis.content}`);
    const unresolvedQuestions = openQuestions
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 12);

    const fallbackPayload = {
      goal: input.goal,
      context: {
        project: project.name,
        currentSynthesis: synthesis.content.slice(0, 1200),
        unresolvedQuestions,
        userRequest: input.userRequest ?? null,
      },
      query: {
        primaryTerms: conceptVariants.slice(0, 8),
        variants: conceptVariants.slice(8, 20),
        inclusionFilters: ["peer-reviewed", "standards", "technical postmortems"],
        exclusionFilters: ["marketing copy", "undated listicles"],
        sourcePreference: ["papers", "standards", "technical blogs"],
      },
      outputShape: {
        sections: ["new concepts", "key references", "contradictions", "next questions"],
        citationRequired: true,
        confidenceRequired: true,
      },
      evidenceAnchor: supportingContext.map((item) => ({
        filePath: item.filePath,
        heading: item.heading,
        excerpt: item.excerpt.slice(0, 220),
      })),
    };
    const aiPayload = await this.tryGenerateAiQueryPayload({
      projectId: input.projectId,
      goal: input.goal,
      userRequest: input.userRequest,
      openQuestions,
      synthesis: synthesis.content,
      unresolvedQuestions,
      supportingContext,
      fallbackPayload,
    });
    const queryPayload = aiPayload ?? fallbackPayload;
    const queryText = JSON.stringify(queryPayload, null, 2);

    const draft: ExternalResearchQueryDraft = {
      queryDraftId: randomId("query"),
      projectId: input.projectId,
      goal: input.goal,
      queryText,
      constraints: {
        mustReferenceOpenQuestion: unresolvedQuestions.length > 0,
        completenessScore: this.completenessScore(queryPayload),
      },
      expectedOutputShape:
        queryPayload.outputShape && typeof queryPayload.outputShape === "object"
          ? (queryPayload.outputShape as Record<string, unknown>)
          : fallbackPayload.outputShape,
      status: "draft",
    };

    this.database.db
      .query(
        `INSERT INTO external_query_drafts
         (query_draft_id, project_id, goal, query_text, constraints_json, expected_output_shape_json, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .run(
        draft.queryDraftId,
        draft.projectId,
        draft.goal,
        draft.queryText,
        JSON.stringify(draft.constraints),
        JSON.stringify(draft.expectedOutputShape),
        draft.status,
        nowIso(),
      );

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "external_research.draft_query",
      actor: input.actor ?? "system",
      payload: {
        queryDraftId: draft.queryDraftId,
        goal: draft.goal,
        source: aiPayload ? "codex" : "fallback",
      },
    });

    return draft;
  }

  listDrafts(projectId: string): ExternalResearchQueryDraft[] {
    const rows = this.database.db
      .query(
        `SELECT query_draft_id, project_id, goal, query_text, constraints_json, expected_output_shape_json, status
         FROM external_query_drafts
         WHERE project_id = ?1
         ORDER BY created_at DESC`,
      )
      .all(projectId) as Array<{
      query_draft_id: string;
      project_id: string;
      goal: string;
      query_text: string;
      constraints_json: string;
      expected_output_shape_json: string;
      status: ExternalResearchQueryDraft["status"];
    }>;

    return rows.map((row) => ({
      queryDraftId: row.query_draft_id,
      projectId: row.project_id,
      goal: row.goal,
      queryText: row.query_text,
      constraints: JSON.parse(row.constraints_json),
      expectedOutputShape: JSON.parse(row.expected_output_shape_json),
      status: row.status,
    }));
  }

  async triggerTool(input: {
    projectId: string;
    queryDraftId: string;
    ingress?: "http" | "mcp";
    actor?: string;
  }): Promise<ExternalResearchRunResult> {
    const draft = this.database.db
      .query(
        `SELECT query_draft_id, query_text
         FROM external_query_drafts
         WHERE project_id = ?1 AND query_draft_id = ?2`,
      )
      .get(input.projectId, input.queryDraftId) as {
      query_draft_id: string;
      query_text: string;
    } | null;

    if (!draft) {
      throw new Error(`Draft not found: ${input.queryDraftId}`);
    }

    this.database.db
      .query(`UPDATE external_query_drafts SET status = 'triggered' WHERE query_draft_id = ?1`)
      .run(input.queryDraftId);

    const queryPackage = JSON.parse(draft.query_text) as Record<string, unknown>;
    const triggerResult = await this.externalToolPort.trigger({
      projectId: input.projectId,
      queryDraftId: input.queryDraftId,
      queryPackage,
    });

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "external_research.trigger_tool",
      actor: input.actor ?? "system",
      payload: {
        queryDraftId: input.queryDraftId,
        mode: triggerResult.mode,
        runId: triggerResult.runId,
      },
    });

    return {
      mode: triggerResult.mode,
      queryDraftId: input.queryDraftId,
      runId: triggerResult.runId,
      accepted: triggerResult.accepted,
      payload: triggerResult.payload,
    };
  }

  private async tryGenerateAiQueryPayload(input: {
    projectId: string;
    goal: string;
    userRequest?: string;
    openQuestions: string;
    synthesis: string;
    unresolvedQuestions: string[];
    supportingContext: Array<{ filePath: string; heading: string; excerpt: string }>;
    fallbackPayload: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> {
    const project = this.workspaceApi.getProject(input.projectId);
    const projectCharter = await this.vaultApi
      .readNote(project.vaultPath, "00-project/project.md")
      .catch(() => "# Project");
    const prompt = [
      "Return JSON only.",
      "Generate an external research query package.",
      "Keep keys: goal, context, query, outputShape, evidenceAnchor.",
      `Goal: ${input.goal}`,
      `User request: ${input.userRequest ?? ""}`,
      "",
      `Open questions:\n${input.openQuestions.slice(0, 1200)}`,
      "",
      `Current synthesis:\n${input.synthesis.slice(0, 1400)}`,
      "",
      `Evidence context:\n${JSON.stringify(input.supportingContext, null, 2)}`,
      "",
      `Fallback package for reference:\n${JSON.stringify(input.fallbackPayload, null, 2)}`,
    ].join("\n");

    const stream = this.codexGateway.streamTurn({
      projectId: input.projectId,
      threadId: randomId("query_draft"),
      packet: {
        systemRules: ["Return JSON only.", "Do not include markdown code fences."],
        projectCharter,
        currentQuestion: prompt,
        threadSummary: "External query drafting",
        retrievedEvidence: input.supportingContext.slice(0, 8),
        allowedTools: [],
        outputContract: {
          mustCite: true,
          allowHypothesis: true,
        },
      },
    });

    let text = "";
    for await (const event of stream) {
      if ((event.type === "token" || event.type === "message") && event.text) {
        text += event.text;
      }
    }

    const parsed = this.extractJsonRecord(text);
    if (!parsed) {
      return null;
    }
    if (!parsed.goal || !parsed.query || !parsed.context) {
      return null;
    }

    return parsed;
  }

  private extractJsonRecord(text: string): Record<string, unknown> | null {
    const fencedJsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedJsonMatch?.[1] ?? text;
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  private extractConceptVariants(text: string): string[] {
    const terms = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 4)
      .slice(0, 80);
    return [...new Set(terms)];
  }

  private completenessScore(payload: Record<string, unknown>): number {
    const query = payload.query as { primaryTerms?: string[] };
    const context = payload.context as { unresolvedQuestions?: string[] };

    let score = 0.4;
    if ((query.primaryTerms?.length ?? 0) >= 3) {
      score += 0.2;
    }
    if ((context.unresolvedQuestions?.length ?? 0) >= 1) {
      score += 0.2;
    }
    score += 0.2;
    return Math.min(1, score);
  }
}
