import type {
  AiStreamEvent,
  Citation,
  Finding,
  RetrievedContextItem,
  SynthesisDocument,
} from "@helix/contracts";
import { DomainError, nowIso, randomId } from "@helix/shared-kernel";
import { createPatch } from "diff";
import type { DatabaseClient } from "../../shared/infrastructure/database";
import type { AuditDocsApi } from "../audit-docs/api";
import type { CodexGateway } from "../conversation/application/codex-gateway";
import type { RetrievalApi } from "../retrieval/api";
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

export interface FindingDraftSuggestion {
  statement: string;
  status: Finding["status"];
  isHypothesis: boolean;
  citations: Citation[];
  tags: string[];
}

export interface FindingsDraftResult {
  suggestions: FindingDraftSuggestion[];
  generatedBy: "codex";
}

export interface SynthesisDraftResult {
  content: string;
  confidence: number;
  citations: Citation[];
  generatedBy: "codex";
}
const PATCHABLE_NOTE_PATTERN =
  /^(00-project|01-questions|03-findings|04-synthesis|05-conversations|06-queries)\/.+\.md$/;
const MAX_PATCH_BYTES = Number(process.env.HELIX_MAX_PATCH_BYTES ?? 1_000_000);
const MAX_FINDING_DRAFT_ITEMS = 10;

export class KnowledgeApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly workspaceApi: WorkspaceApi,
    private readonly vaultApi: VaultApi,
    private readonly retrievalApi: RetrievalApi,
    private readonly codexGateway: CodexGateway,
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

  async draftFindings(input: {
    projectId: string;
    maxItems?: number;
    ingress?: "http" | "mcp";
    actor?: string;
  }): Promise<FindingsDraftResult> {
    let done: FindingsDraftResult | null = null;
    for await (const event of this.streamDraftFindings(input)) {
      if (event.type === "done") {
        done = event.result;
      }
    }
    if (!done) {
      throw new Error("Findings draft did not complete");
    }
    return done;
  }

  async *streamDraftFindings(input: {
    projectId: string;
    maxItems?: number;
    ingress?: "http" | "mcp";
    actor?: string;
    signal?: AbortSignal;
  }): AsyncGenerator<AiStreamEvent<FindingsDraftResult>> {
    const action = "findings_draft" as const;
    const startedAt = Date.now();
    const boundedMaxItems = Math.max(1, Math.min(input.maxItems ?? 5, MAX_FINDING_DRAFT_ITEMS));

    yield this.stageEvent(action, "prepare", "Preparing findings draft", 5);
    this.throwIfAborted(input.signal);

    yield this.stageEvent(action, "load_context", "Loading synthesis and open questions", 20);
    const synthesis = await this.getSynthesis(input.projectId);
    const openQuestions = await this.readOpenQuestions(input.projectId);
    this.throwIfAborted(input.signal);

    yield this.stageEvent(action, "retrieve_evidence", "Retrieving evidence context", 40);
    const evidence = await this.retrievalApi.retrieveContext({
      projectId: input.projectId,
      question: `Draft findings from project evidence. ${openQuestions}`.slice(0, 180),
      maxItems: Math.max(6, boundedMaxItems * 2),
      ingress: input.ingress,
      actor: input.actor,
    });
    this.throwIfAborted(input.signal);

    yield {
      type: "artifact",
      action,
      name: "evidence_preview",
      data: evidence.slice(0, 5).map((item) => ({
        filePath: item.filePath,
        heading: item.heading,
        excerpt: item.excerpt.slice(0, 160),
      })),
    };

    const fallbackSuggestions = this.buildFallbackFindingSuggestions(evidence, boundedMaxItems);

    const evidenceDigest = evidence.slice(0, 12).map((item) => ({
      filePath: item.filePath,
      heading: item.heading,
      startLine: item.startLine,
      endLine: item.endLine,
      excerpt: item.excerpt.slice(0, 260),
      sourceType: item.sourceType,
      confidence: item.confidence,
    }));

    const prompt = [
      "Return JSON only.",
      "Generate evidence-grounded finding suggestions.",
      `Max items: ${boundedMaxItems}.`,
      'Output shape: {"suggestions":[{"statement":"","status":"supported|tentative|contradicted","isHypothesis":boolean,"citations":Citation[],"tags":string[]}]}',
      "If citations are missing for a non-hypothesis, include at least one.",
      "",
      `Open questions:\n${openQuestions.slice(0, 1200)}`,
      "",
      `Current synthesis:\n${synthesis.content.slice(0, 1600)}`,
      "",
      `Evidence:\n${JSON.stringify(evidenceDigest, null, 2)}`,
    ].join("\n");

    yield this.stageEvent(action, "generate", "Generating candidate findings", 70);
    const iterator = this.streamCodexJsonText({
      projectId: input.projectId,
      prompt,
      evidence: evidenceDigest,
      signal: input.signal,
    })[Symbol.asyncIterator]();

    let raw = "";
    while (true) {
      const step = await iterator.next();
      if (step.done) {
        raw = step.value ?? "";
        break;
      }
      if (step.value.trim().length > 0) {
        yield {
          type: "token",
          action,
          text: step.value,
        };
      }
    }

    const parsed = raw ? this.extractJsonRecord(raw) : null;
    const suggestionRows = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const aiSuggestions = suggestionRows
      .map((row) => this.normalizeSuggestion(row, evidence))
      .filter((row): row is FindingDraftSuggestion => row !== null)
      .slice(0, boundedMaxItems);

    this.throwIfAborted(input.signal);
    yield this.stageEvent(action, "finalize", "Finalizing findings draft", 95);

    const suggestions = (aiSuggestions.length > 0 ? aiSuggestions : fallbackSuggestions).slice(
      0,
      boundedMaxItems,
    );
    const source = aiSuggestions.length > 0 ? "codex" : "fallback";

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "knowledge.draft_findings",
      actor: input.actor ?? "system",
      payload: {
        maxItems: boundedMaxItems,
        generatedItems: suggestions.length,
        source,
      },
    });

    yield {
      type: "done",
      action,
      source,
      durationMs: Date.now() - startedAt,
      result: {
        suggestions,
        generatedBy: "codex",
      },
    };
  }

  async draftSynthesis(input: {
    projectId: string;
    selectedFindingIds: string[];
    ingress?: "http" | "mcp";
    actor?: string;
  }): Promise<SynthesisDraftResult> {
    let done: SynthesisDraftResult | null = null;
    for await (const event of this.streamDraftSynthesis(input)) {
      if (event.type === "done") {
        done = event.result;
      }
    }
    if (!done) {
      throw new Error("Synthesis draft did not complete");
    }
    return done;
  }

  async *streamDraftSynthesis(input: {
    projectId: string;
    selectedFindingIds: string[];
    ingress?: "http" | "mcp";
    actor?: string;
    signal?: AbortSignal;
  }): AsyncGenerator<AiStreamEvent<SynthesisDraftResult>> {
    const action = "synthesis_draft" as const;
    const startedAt = Date.now();
    yield this.stageEvent(action, "prepare", "Preparing synthesis draft", 5);

    if (input.selectedFindingIds.length === 0) {
      throw new DomainError(
        "At least one finding must be selected to draft synthesis",
        "KNOWLEDGE_SYNTHESIS_DRAFT_NEEDS_FINDINGS",
      );
    }

    const selected = this.listFindings(input.projectId).filter((finding) =>
      input.selectedFindingIds.includes(finding.findingId),
    );
    if (selected.length === 0) {
      throw new DomainError(
        "Selected findings were not found in this project",
        "KNOWLEDGE_SYNTHESIS_DRAFT_FINDINGS_NOT_FOUND",
      );
    }

    yield this.stageEvent(action, "retrieve_evidence", "Retrieving supporting evidence", 40);
    const question = selected
      .map((finding) => finding.statement)
      .join(" ")
      .slice(0, 220);
    const evidence = await this.retrievalApi.retrieveContext({
      projectId: input.projectId,
      question,
      maxItems: 8,
      ingress: input.ingress,
      actor: input.actor,
    });
    const citations = evidence.map((item) => this.citationFromEvidence(item)).slice(0, 8);
    this.throwIfAborted(input.signal);

    yield {
      type: "artifact",
      action,
      name: "citations",
      data: citations,
    };

    const fallbackContent = this.buildFallbackSynthesis(selected, citations);
    const prompt = [
      "Return JSON only.",
      "Generate a concise markdown synthesis draft grounded in selected findings and citations.",
      'Output shape: {"content":"markdown","confidence":0.0}',
      "",
      `Selected findings:\n${JSON.stringify(selected, null, 2)}`,
      "",
      `Citations:\n${JSON.stringify(citations, null, 2)}`,
    ].join("\n");

    yield this.stageEvent(action, "generate", "Generating synthesis draft", 70);
    const iterator = this.streamCodexJsonText({
      projectId: input.projectId,
      prompt,
      evidence: citations,
      signal: input.signal,
    })[Symbol.asyncIterator]();

    let raw = "";
    while (true) {
      const step = await iterator.next();
      if (step.done) {
        raw = step.value ?? "";
        break;
      }
      if (step.value.trim().length > 0) {
        yield {
          type: "token",
          action,
          text: step.value,
        };
      }
    }

    const parsed = raw ? this.extractJsonRecord(raw) : null;
    const aiContent = typeof parsed?.content === "string" ? parsed.content.trim() : "";
    const aiConfidence =
      typeof parsed?.confidence === "number" ? this.normalizeConfidence(parsed.confidence) : 0.7;
    const source = aiContent.length > 0 ? "codex" : "fallback";

    this.throwIfAborted(input.signal);
    yield this.stageEvent(action, "finalize", "Finalizing synthesis draft", 95);

    const content = aiContent.length > 0 ? aiContent : fallbackContent;
    const confidence = this.normalizeConfidence(aiConfidence);

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "knowledge.draft_synthesis",
      actor: input.actor ?? "system",
      payload: {
        selectedFindingIds: input.selectedFindingIds,
        citationCount: citations.length,
        source,
      },
    });

    yield {
      type: "done",
      action,
      source,
      durationMs: Date.now() - startedAt,
      result: {
        content,
        confidence,
        citations,
        generatedBy: "codex",
      },
    };
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
    if (!PATCHABLE_NOTE_PATTERN.test(input.targetPath)) {
      throw new DomainError(
        `Patch target is not allowed: ${input.targetPath}`,
        "KNOWLEDGE_PATCH_TARGET_NOT_ALLOWED",
      );
    }
    if (Buffer.byteLength(input.proposedContent, "utf8") > MAX_PATCH_BYTES) {
      throw new DomainError(
        `Patch content exceeds limit (${MAX_PATCH_BYTES} bytes)`,
        "KNOWLEDGE_PATCH_TOO_LARGE",
      );
    }

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

  private async readOpenQuestions(projectId: string): Promise<string> {
    const project = this.workspaceApi.getProject(projectId);
    return this.vaultApi
      .readNote(project.vaultPath, "01-questions/open-questions.md")
      .catch(() => "");
  }

  private buildFallbackFindingSuggestions(
    evidence: RetrievedContextItem[],
    maxItems: number,
  ): FindingDraftSuggestion[] {
    const seeded = evidence.slice(0, maxItems).map((item) => ({
      statement: this.fallbackStatementFromEvidence(item),
      status: "tentative" as Finding["status"],
      isHypothesis: false,
      citations: [this.citationFromEvidence(item)],
      tags: ["ai-draft", "evidence-based"],
    }));
    if (seeded.length > 0) {
      return seeded;
    }

    return [
      {
        statement: "Hypothesis: existing project notes likely contain unresolved evidence gaps.",
        status: "tentative",
        isHypothesis: true,
        citations: [],
        tags: ["ai-draft", "hypothesis"],
      },
    ];
  }

  private buildFallbackSynthesis(selected: Finding[], citations: Citation[]): string {
    const findingsBlock = selected
      .slice(0, 10)
      .map((finding) => `- ${finding.statement} (${finding.status})`)
      .join("\n");
    const evidenceBlock = citations
      .slice(0, 6)
      .map((citation) => `- ${citation.filePath} · ${citation.heading}`)
      .join("\n");

    return [
      "# Current Synthesis",
      "",
      "## Draft Summary",
      findingsBlock || "- No selected findings.",
      "",
      "## Evidence Anchors",
      evidenceBlock || "- No evidence anchors available.",
      "",
      "## Next Questions",
      "- Which claims require stronger citations?",
      "- Which hypotheses should be tested next?",
      "",
    ].join("\n");
  }

  private stageEvent(
    action: "findings_draft" | "synthesis_draft",
    stage: string,
    message: string,
    percent: number,
  ): AiStreamEvent<never> {
    return {
      type: "stage",
      action,
      stage,
      message,
      percent,
      at: nowIso(),
    };
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DomainError("Generation canceled", "AI_STREAM_ABORTED");
    }
  }

  private async *streamCodexJsonText(input: {
    projectId: string;
    prompt: string;
    evidence: unknown[];
    signal?: AbortSignal;
  }): AsyncGenerator<string, string, void> {
    const project = this.workspaceApi.getProject(input.projectId);
    const projectCharter = await this.vaultApi
      .readNote(project.vaultPath, "00-project/project.md")
      .catch(() => "# Project");
    const stream = this.codexGateway.streamTurn({
      projectId: input.projectId,
      threadId: randomId("draft_thread"),
      signal: input.signal,
      packet: {
        systemRules: [
          "Return JSON only.",
          "Be evidence-grounded.",
          "Do not include prose outside JSON.",
        ],
        projectCharter,
        currentQuestion: input.prompt,
        threadSummary: "Drafting task",
        retrievedEvidence: input.evidence.map((item) => ({
          filePath: String((item as { filePath?: string }).filePath ?? "unknown"),
          heading: String((item as { heading?: string }).heading ?? "evidence"),
          excerpt: JSON.stringify(item).slice(0, 280),
        })),
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
        yield event.text;
      }
      this.throwIfAborted(input.signal);
    }

    return text.trim();
  }

  private async tryGenerateFindingSuggestions(input: {
    projectId: string;
    openQuestions: string;
    synthesisContent: string;
    evidence: RetrievedContextItem[];
    maxItems: number;
  }): Promise<FindingDraftSuggestion[] | null> {
    const evidenceDigest = input.evidence.slice(0, 12).map((item) => ({
      filePath: item.filePath,
      heading: item.heading,
      startLine: item.startLine,
      endLine: item.endLine,
      excerpt: item.excerpt.slice(0, 260),
      sourceType: item.sourceType,
      confidence: item.confidence,
    }));
    const prompt = [
      "Return JSON only.",
      "Generate evidence-grounded finding suggestions.",
      `Max items: ${input.maxItems}.`,
      'Output shape: {"suggestions":[{"statement":"","status":"supported|tentative|contradicted","isHypothesis":boolean,"citations":Citation[],"tags":string[]}]}',
      "If citations are missing for a non-hypothesis, include at least one.",
      "",
      `Open questions:\n${input.openQuestions.slice(0, 1200)}`,
      "",
      `Current synthesis:\n${input.synthesisContent.slice(0, 1600)}`,
      "",
      `Evidence:\n${JSON.stringify(evidenceDigest, null, 2)}`,
    ].join("\n");

    const raw = await this.collectCodexJsonText(input.projectId, prompt, evidenceDigest);
    if (!raw) {
      return null;
    }

    const parsed = this.extractJsonRecord(raw);
    const suggestionRows = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const suggestions = suggestionRows
      .map((row) => this.normalizeSuggestion(row, input.evidence))
      .filter((row): row is FindingDraftSuggestion => row !== null)
      .slice(0, input.maxItems);

    return suggestions.length > 0 ? suggestions : null;
  }

  private async tryGenerateSynthesisDraft(input: {
    projectId: string;
    selectedFindings: Finding[];
    citations: Citation[];
  }): Promise<{ content: string; confidence: number } | null> {
    const prompt = [
      "Return JSON only.",
      "Generate a concise markdown synthesis draft grounded in selected findings and citations.",
      'Output shape: {"content":"markdown","confidence":0.0}',
      "",
      `Selected findings:\n${JSON.stringify(input.selectedFindings, null, 2)}`,
      "",
      `Citations:\n${JSON.stringify(input.citations, null, 2)}`,
    ].join("\n");

    const raw = await this.collectCodexJsonText(input.projectId, prompt, input.citations);
    if (!raw) {
      return null;
    }

    const parsed = this.extractJsonRecord(raw);
    if (!parsed) {
      return null;
    }

    const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
    if (content.length === 0) {
      return null;
    }

    return {
      content,
      confidence: this.normalizeConfidence(
        typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      ),
    };
  }

  private async collectCodexJsonText(
    projectId: string,
    prompt: string,
    evidence: unknown[],
    signal?: AbortSignal,
  ): Promise<string | null> {
    let text = "";
    const iterator = this.streamCodexJsonText({
      projectId,
      prompt,
      evidence,
      signal,
    })[Symbol.asyncIterator]();

    while (true) {
      const step = await iterator.next();
      if (step.done) {
        text = step.value ?? "";
        break;
      }
    }

    return text.trim() ? text : null;
  }

  private extractJsonRecord(text: string): Record<string, unknown> | null {
    const fencedJsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedJsonMatch?.[1] ?? text;
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonSlice) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  private normalizeSuggestion(
    raw: unknown,
    evidence: RetrievedContextItem[],
  ): FindingDraftSuggestion | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const row = raw as Record<string, unknown>;
    const statement = String(row.statement ?? "").trim();
    if (statement.length === 0) {
      return null;
    }
    const normalizedStatement = statement
      .replace(/^Evidence suggests:\s*/i, "Potential finding: ")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();

    const status =
      row.status === "supported" || row.status === "contradicted" || row.status === "tentative"
        ? row.status
        : "tentative";
    let isHypothesis = Boolean(row.isHypothesis);
    const tags = Array.isArray(row.tags)
      ? row.tags
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];

    const citations = Array.isArray(row.citations)
      ? row.citations
          .map((item) => this.normalizeCitation(item))
          .filter((item): item is Citation => item !== null)
          .slice(0, 5)
      : [];

    if (!isHypothesis && citations.length === 0) {
      const firstEvidence = evidence[0];
      if (firstEvidence) {
        citations.push(this.citationFromEvidence(firstEvidence));
      }
    }
    if (!isHypothesis && citations.length === 0) {
      isHypothesis = true;
    }

    return {
      statement: normalizedStatement.slice(0, 500),
      status,
      isHypothesis,
      citations,
      tags,
    };
  }

  private fallbackStatementFromEvidence(item: RetrievedContextItem): string {
    const cleaned = item.excerpt
      .split(/\r?\n/)
      .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? "";
    const text = (firstSentence || `${item.heading} in ${item.filePath}`)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    const suffix = text.endsWith(".") ? "" : ".";
    return `Potential finding: ${text}${suffix}`;
  }

  private normalizeCitation(raw: unknown): Citation | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const row = raw as Record<string, unknown>;
    const filePath = String(row.filePath ?? "").trim();
    if (!filePath) {
      return null;
    }

    const sourceType =
      row.sourceType === "imported_report" ||
      row.sourceType === "synthesis" ||
      row.sourceType === "finding" ||
      row.sourceType === "project_note"
        ? row.sourceType
        : "project_note";

    return {
      filePath,
      heading: String(row.heading ?? "Evidence"),
      startLine: Number(row.startLine ?? 1),
      endLine: Number(row.endLine ?? Number(row.startLine ?? 1)),
      excerpt: String(row.excerpt ?? "").slice(0, 800),
      sourceType,
      confidence: this.normalizeConfidence(
        typeof row.confidence === "number" ? row.confidence : 0.65,
      ),
    };
  }

  private citationFromEvidence(item: RetrievedContextItem): Citation {
    return {
      filePath: item.filePath,
      heading: item.heading,
      startLine: item.startLine,
      endLine: item.endLine,
      excerpt: item.excerpt,
      sourceType: item.sourceType,
      confidence: item.confidence,
    };
  }

  private normalizeConfidence(value: number): number {
    if (Number.isNaN(value)) {
      return 0.6;
    }
    return Math.max(0.1, Math.min(1, value));
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
