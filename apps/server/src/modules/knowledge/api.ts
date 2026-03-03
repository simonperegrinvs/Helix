import type { Citation, Finding, SynthesisDocument } from "@helix/contracts";
import { DomainError, nowIso, randomId } from "@helix/shared-kernel";
import { createPatch } from "diff";
import type { DatabaseClient } from "../../shared/infrastructure/database";
import type { AuditDocsApi } from "../audit-docs/api";
import type { VaultApi } from "../vault/api";
import type { WorkspaceApi } from "../workspace/api";

interface RegisterFindingInput {
  projectId: string;
  statement: string;
  status: Finding["status"];
  isHypothesis?: boolean;
  citations: Citation[];
  tags?: string[];
  ingress?: "http" | "mcp";
  actor?: string;
}

interface ProposePatchInput {
  projectId: string;
  targetPath: string;
  proposedContent: string;
  ingress?: "http" | "mcp";
  actor?: string;
}

interface ApplyPatchInput {
  projectId: string;
  proposalId: string;
  approvalToken: string;
  ingress?: "http" | "mcp";
  actor?: string;
}

export class KnowledgeApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly workspaceApi: WorkspaceApi,
    private readonly vaultApi: VaultApi,
    private readonly auditApi: AuditDocsApi,
  ) {}

  registerFinding(input: RegisterFindingInput): Finding {
    const isHypothesis = input.isHypothesis ?? false;
    if (input.citations.length === 0 && !isHypothesis) {
      throw new DomainError(
        "Finding requires at least one citation unless marked as a hypothesis",
        "KNOWLEDGE_FINDING_NEEDS_CITATION",
      );
    }

    const finding: Finding = {
      findingId: randomId("finding"),
      projectId: input.projectId,
      statement: input.statement,
      status: input.status,
      isHypothesis,
      citations: input.citations,
      tags: input.tags ?? [],
    };

    this.database.db
      .query(
        `INSERT INTO findings (finding_id, project_id, statement, status, is_hypothesis, citations_json, tags_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .run(
        finding.findingId,
        finding.projectId,
        finding.statement,
        finding.status,
        finding.isHypothesis ? 1 : 0,
        JSON.stringify(finding.citations),
        JSON.stringify(finding.tags),
        nowIso(),
      );

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "knowledge.register_finding",
      actor: input.actor ?? "system",
      payload: {
        findingId: finding.findingId,
        status: finding.status,
      },
    });

    return finding;
  }

  listFindings(projectId: string): Finding[] {
    const rows = this.database.db
      .query(
        `SELECT finding_id, project_id, statement, status, is_hypothesis, citations_json, tags_json
         FROM findings WHERE project_id = ?1 ORDER BY created_at DESC`,
      )
      .all(projectId) as Array<{
      finding_id: string;
      project_id: string;
      statement: string;
      status: Finding["status"];
      is_hypothesis: number;
      citations_json: string;
      tags_json: string;
    }>;

    return rows.map((row) => ({
      findingId: row.finding_id,
      projectId: row.project_id,
      statement: row.statement,
      status: row.status,
      isHypothesis: row.is_hypothesis === 1,
      citations: JSON.parse(row.citations_json) as Citation[],
      tags: JSON.parse(row.tags_json) as string[],
    }));
  }

  async getSynthesis(projectId: string): Promise<{ doc: SynthesisDocument; content: string }> {
    const project = this.workspaceApi.getProject(projectId);
    const row = this.database.db
      .query(
        `SELECT project_id, version, summary_path, updated_at, confidence
         FROM synthesis_documents
         WHERE project_id = ?1`,
      )
      .get(projectId) as {
      project_id: string;
      version: number;
      summary_path: string;
      updated_at: string;
      confidence: number;
    } | null;

    if (!row) {
      const summaryPath = "04-synthesis/current-synthesis.md";
      const defaultDoc: SynthesisDocument = {
        projectId,
        version: 1,
        summaryPath,
        updatedAt: nowIso(),
        confidence: 0.25,
      };
      await this.vaultApi.writeNote(
        project.vaultPath,
        summaryPath,
        "# Current Synthesis\n\nNo synthesis yet.\n",
      );
      this.database.db
        .query(
          `INSERT INTO synthesis_documents (project_id, version, summary_path, updated_at, confidence)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .run(
          projectId,
          defaultDoc.version,
          defaultDoc.summaryPath,
          defaultDoc.updatedAt,
          defaultDoc.confidence,
        );
      return {
        doc: defaultDoc,
        content: await this.vaultApi.readNote(project.vaultPath, summaryPath),
      };
    }

    const doc: SynthesisDocument = {
      projectId: row.project_id,
      version: row.version,
      summaryPath: row.summary_path,
      updatedAt: row.updated_at,
      confidence: row.confidence,
    };

    return {
      doc,
      content: await this.vaultApi.readNote(project.vaultPath, doc.summaryPath),
    };
  }

  async updateSynthesis(input: {
    projectId: string;
    content: string;
    confidence: number;
    ingress?: "http" | "mcp";
    actor?: string;
  }): Promise<SynthesisDocument> {
    const project = this.workspaceApi.getProject(input.projectId);
    const current = await this.getSynthesis(input.projectId);
    const nextVersion = current.doc.version + 1;
    const updatedAt = nowIso();

    await this.vaultApi.writeNote(project.vaultPath, current.doc.summaryPath, input.content);

    this.database.db
      .query(
        `UPDATE synthesis_documents
         SET version = ?1, updated_at = ?2, confidence = ?3
         WHERE project_id = ?4`,
      )
      .run(nextVersion, updatedAt, input.confidence, input.projectId);

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "knowledge.update_synthesis",
      actor: input.actor ?? "system",
      payload: {
        version: nextVersion,
        confidence: input.confidence,
      },
    });

    return {
      projectId: input.projectId,
      version: nextVersion,
      summaryPath: current.doc.summaryPath,
      updatedAt,
      confidence: input.confidence,
    };
  }

  async proposePatch(input: ProposePatchInput): Promise<{
    proposalId: string;
    diff: string;
    targetPath: string;
  }> {
    const project = this.workspaceApi.getProject(input.projectId);
    const existing = await this.vaultApi
      .readNote(project.vaultPath, input.targetPath)
      .catch(() => "");

    const proposalId = randomId("patch");
    const diff = createPatch(input.targetPath, existing, input.proposedContent, "before", "after");

    this.database.db
      .query(
        `INSERT INTO patch_proposals (proposal_id, project_id, target_path, proposed_content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .run(proposalId, input.projectId, input.targetPath, input.proposedContent, nowIso());

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "knowledge.propose_patch",
      actor: input.actor ?? "system",
      payload: {
        proposalId,
        targetPath: input.targetPath,
      },
    });

    return {
      proposalId,
      diff,
      targetPath: input.targetPath,
    };
  }

  async createApprovalToken(projectId: string, action: string, ttlMinutes = 10): Promise<string> {
    const token = randomId("approval");
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    this.database.db
      .query(
        `INSERT INTO approval_tokens (token, project_id, action, expires_at, used_at)
         VALUES (?1, ?2, ?3, ?4, NULL)`,
      )
      .run(token, projectId, action, expiresAt);
    return token;
  }

  async applyPatch(input: ApplyPatchInput): Promise<{ applied: boolean; targetPath: string }> {
    const tokenRow = this.database.db
      .query(
        `SELECT token, project_id, action, expires_at, used_at
         FROM approval_tokens
         WHERE token = ?1`,
      )
      .get(input.approvalToken) as {
      token: string;
      project_id: string;
      action: string;
      expires_at: string;
      used_at: string | null;
    } | null;

    if (
      !tokenRow ||
      tokenRow.project_id !== input.projectId ||
      tokenRow.action !== "knowledge.apply_patch"
    ) {
      throw new DomainError("Approval token is invalid", "KNOWLEDGE_INVALID_APPROVAL_TOKEN");
    }
    if (tokenRow.used_at) {
      throw new DomainError("Approval token already used", "KNOWLEDGE_APPROVAL_USED");
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      throw new DomainError("Approval token expired", "KNOWLEDGE_APPROVAL_EXPIRED");
    }

    const proposal = this.database.db
      .query(
        `SELECT proposal_id, project_id, target_path, proposed_content, applied_at
         FROM patch_proposals
         WHERE proposal_id = ?1`,
      )
      .get(input.proposalId) as {
      proposal_id: string;
      project_id: string;
      target_path: string;
      proposed_content: string;
      applied_at: string | null;
    } | null;

    if (!proposal || proposal.project_id !== input.projectId) {
      throw new DomainError("Patch proposal not found", "KNOWLEDGE_PATCH_NOT_FOUND");
    }
    if (proposal.applied_at) {
      throw new DomainError("Patch proposal already applied", "KNOWLEDGE_PATCH_ALREADY_APPLIED");
    }

    const project = this.workspaceApi.getProject(input.projectId);
    await this.vaultApi.writeNote(
      project.vaultPath,
      proposal.target_path,
      proposal.proposed_content,
    );

    this.database.db
      .query("UPDATE patch_proposals SET applied_at = ?1 WHERE proposal_id = ?2")
      .run(nowIso(), proposal.proposal_id);
    this.database.db
      .query("UPDATE approval_tokens SET used_at = ?1 WHERE token = ?2")
      .run(nowIso(), tokenRow.token);

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "knowledge.apply_patch",
      actor: input.actor ?? "system",
      payload: {
        proposalId: proposal.proposal_id,
        targetPath: proposal.target_path,
      },
    });

    return {
      applied: true,
      targetPath: proposal.target_path,
    };
  }

  listEvidence(
    projectId: string,
  ): Array<{ type: string; path: string; id: string; createdAt?: string }> {
    const reports = this.database.db
      .query(
        `SELECT report_id, normalized_path, imported_at
         FROM imported_reports
         WHERE project_id = ?1`,
      )
      .all(projectId) as Array<{ report_id: string; normalized_path: string; imported_at: string }>;

    const findings = this.database.db
      .query(
        `SELECT finding_id, created_at
         FROM findings
         WHERE project_id = ?1`,
      )
      .all(projectId) as Array<{ finding_id: string; created_at: string }>;

    return [
      ...reports.map((report) => ({
        type: "imported_report",
        path: report.normalized_path,
        id: report.report_id,
        createdAt: report.imported_at,
      })),
      ...findings.map((finding) => ({
        type: "finding",
        path: "03-findings/findings.md",
        id: finding.finding_id,
        createdAt: finding.created_at,
      })),
    ];
  }
}
