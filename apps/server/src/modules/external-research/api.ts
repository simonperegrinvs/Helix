import type { ExternalResearchQueryDraft } from "@helix/contracts";
import { nowIso, randomId } from "@helix/shared-kernel";
import type { DatabaseClient } from "../../shared/infrastructure/database";
import type { AuditDocsApi } from "../audit-docs/api";
import type { KnowledgeApi } from "../knowledge/api";
import type { RetrievalApi } from "../retrieval/api";
import type { VaultApi } from "../vault/api";
import type { WorkspaceApi } from "../workspace/api";

export interface ExternalResearchRunResult {
  mode: "manual";
  queryDraftId: string;
  payload: Record<string, unknown>;
}

export class ExternalResearchApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly workspaceApi: WorkspaceApi,
    private readonly retrievalApi: RetrievalApi,
    private readonly knowledgeApi: KnowledgeApi,
    private readonly vaultApi: VaultApi,
    private readonly auditApi: AuditDocsApi,
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

    const queryPayload = {
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
      expectedOutputShape: queryPayload.outputShape,
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

  triggerTool(input: {
    projectId: string;
    queryDraftId: string;
    ingress?: "http" | "mcp";
    actor?: string;
  }): ExternalResearchRunResult {
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

    const payload = JSON.parse(draft.query_text) as Record<string, unknown>;

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "external_research.trigger_tool",
      actor: input.actor ?? "system",
      payload: {
        queryDraftId: input.queryDraftId,
        mode: "manual",
      },
    });

    return {
      mode: "manual",
      queryDraftId: input.queryDraftId,
      payload,
    };
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
