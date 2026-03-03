import type { AiStreamEvent } from "@helix/contracts";
import { nowIso, randomId } from "@helix/shared-kernel";
import type { AuditDocsApi } from "../audit-docs/api";
import type { ConversationApi } from "../conversation/api";
import type { ExternalResearchApi } from "../external-research/api";
import type { KnowledgeApi } from "../knowledge/api";
import type { ReportImportApi } from "../report-import/api";
import type { RetrievalApi } from "../retrieval/api";
import type { WorkspaceApi } from "../workspace/api";

interface ToolCallInput {
  name: string;
  args: Record<string, unknown>;
  actor?: string;
}

type AiJobStatus = "running" | "succeeded" | "failed";
type AiJobAction = "chat_turn" | "findings_draft" | "synthesis_draft" | "external_query_draft";

interface AiJobRecord {
  jobId: string;
  projectId: string;
  action: AiJobAction;
  status: AiJobStatus;
  startedAt: string;
  updatedAt: string;
  latestStage: string;
  percent: number;
  tokenPreview: string;
  events: AiStreamEvent[];
  result?: unknown;
  error?: string;
}

const MAX_JOB_EVENTS = 50;
const MAX_TOKEN_PREVIEW = 1200;
const FINISHED_JOB_TTL_MS = 30 * 60_000;

export class McpInterfaceApi {
  private readonly jobs = new Map<string, AiJobRecord>();

  constructor(
    private readonly workspaceApi: WorkspaceApi,
    private readonly retrievalApi: RetrievalApi,
    private readonly knowledgeApi: KnowledgeApi,
    private readonly reportImportApi: ReportImportApi,
    private readonly externalResearchApi: ExternalResearchApi,
    private readonly conversationApi: ConversationApi,
    private readonly auditApi: AuditDocsApi,
  ) {}

  listTools(): Array<{ name: string; description: string; readOnly: boolean }> {
    return [
      { name: "projects.list", description: "List projects", readOnly: true },
      { name: "projects.get_manifest", description: "Get project manifest", readOnly: true },
      { name: "projects.get_overview", description: "Get project overview", readOnly: true },
      {
        name: "project.search",
        description: "Retrieve project evidence with citations",
        readOnly: true,
      },
      { name: "project.get_synthesis", description: "Read project synthesis", readOnly: true },
      { name: "reports.list", description: "List imported reports", readOnly: true },
      { name: "reports.get", description: "Get one report", readOnly: true },
      { name: "audit.tail", description: "Tail project audit events", readOnly: true },
      { name: "ai.job.get", description: "Get async AI job status and result", readOnly: true },
      {
        name: "ai.chat.start",
        description: "Start async grounded chat generation",
        readOnly: false,
      },
      {
        name: "ai.findings_draft.start",
        description: "Start async findings draft generation",
        readOnly: false,
      },
      {
        name: "ai.synthesis_draft.start",
        description: "Start async synthesis draft generation",
        readOnly: false,
      },
      {
        name: "ai.external_query_draft.start",
        description: "Start async external query package generation",
        readOnly: false,
      },
      {
        name: "external_query.trigger",
        description: "Trigger an approved query draft in external tool adapter",
        readOnly: false,
      },
      {
        name: "import_report.register",
        description: "Register import metadata and bytes",
        readOnly: false,
      },
      {
        name: "knowledge.propose_patch",
        description: "Create patch proposal for vault notes",
        readOnly: false,
      },
      {
        name: "knowledge.apply_patch",
        description: "Apply approved patch proposal",
        readOnly: false,
      },
    ];
  }

  async handleToolCall(input: ToolCallInput): Promise<unknown> {
    if (input.name !== "projects.list") {
      this.assertProjectId(input.args);
    }
    const toolProjectId =
      typeof input.args.projectId === "string" ? String(input.args.projectId) : "global";

    try {
      let result: unknown;
      switch (input.name) {
        case "projects.list":
          result = this.workspaceApi.listProjects();
          break;

        case "projects.get_manifest": {
          const projectId = this.projectId(input.args);
          const project = this.workspaceApi.getProject(projectId);
          result = {
            projectId,
            vaultPath: `${project.vaultPath}/.research/manifest.json`,
          };
          break;
        }

        case "projects.get_overview": {
          result = this.workspaceApi.getProjectOverview(this.projectId(input.args));
          break;
        }

        case "project.search": {
          const projectId = this.projectId(input.args);
          result = await this.retrievalApi.retrieveContext({
            projectId,
            question: String(input.args.question ?? ""),
            maxItems: Number(input.args.maxItems ?? 8),
            ingress: "mcp",
            actor: input.actor,
          });
          break;
        }

        case "project.get_synthesis": {
          result = await this.knowledgeApi.getSynthesis(this.projectId(input.args));
          break;
        }

        case "reports.list": {
          result = this.reportImportApi.listReports(this.projectId(input.args));
          break;
        }

        case "reports.get": {
          result = this.reportImportApi.getReport(
            this.projectId(input.args),
            String(input.args.reportId ?? ""),
          );
          break;
        }

        case "audit.tail": {
          result = this.auditApi.tailEvents(
            this.projectId(input.args),
            Number(input.args.limit ?? 20),
          );
          break;
        }

        case "ai.job.get": {
          const projectId = this.projectId(input.args);
          const jobId = String(input.args.jobId ?? "");
          result = this.getJob(projectId, jobId);
          break;
        }

        case "ai.chat.start": {
          const projectId = this.projectId(input.args);
          const question = String(input.args.question ?? "");
          const threadId = input.args.threadId ? String(input.args.threadId) : undefined;
          result = this.startJob({
            projectId,
            action: "chat_turn",
            stream: () =>
              this.streamChatJob({
                projectId,
                question,
                threadId,
                actor: input.actor,
              }),
          });
          break;
        }

        case "ai.findings_draft.start": {
          const projectId = this.projectId(input.args);
          const maxItems = Number(input.args.maxItems ?? 5);
          result = this.startJob({
            projectId,
            action: "findings_draft",
            stream: () =>
              this.knowledgeApi.streamDraftFindings({
                projectId,
                maxItems,
                ingress: "mcp",
                actor: input.actor,
              }),
          });
          break;
        }

        case "ai.synthesis_draft.start": {
          const projectId = this.projectId(input.args);
          const selectedFindingIds = Array.isArray(input.args.selectedFindingIds)
            ? input.args.selectedFindingIds.map((item) => String(item))
            : [];
          result = this.startJob({
            projectId,
            action: "synthesis_draft",
            stream: () =>
              this.knowledgeApi.streamDraftSynthesis({
                projectId,
                selectedFindingIds,
                ingress: "mcp",
                actor: input.actor,
              }),
          });
          break;
        }

        case "ai.external_query_draft.start": {
          const projectId = this.projectId(input.args);
          result = this.startJob({
            projectId,
            action: "external_query_draft",
            stream: () =>
              this.externalResearchApi.streamDraftResearchQuery({
                projectId,
                goal: String(input.args.goal ?? "Research gap follow-up"),
                userRequest: input.args.userRequest ? String(input.args.userRequest) : undefined,
                ingress: "mcp",
                actor: input.actor,
              }),
          });
          break;
        }

        case "external_query.trigger": {
          result = await this.externalResearchApi.triggerTool({
            projectId: this.projectId(input.args),
            queryDraftId: String(input.args.queryDraftId ?? ""),
            ingress: "mcp",
            actor: input.actor,
          });
          break;
        }

        case "import_report.register": {
          result = await this.reportImportApi.importReport({
            projectId: this.projectId(input.args),
            sourceType: String(input.args.sourceType ?? "external"),
            originalFilename: String(input.args.originalFilename ?? "report.md"),
            content: input.args.content ? String(input.args.content) : undefined,
            sourcePath: input.args.sourcePath ? String(input.args.sourcePath) : undefined,
            ingress: "mcp",
            actor: input.actor,
          });
          break;
        }

        case "knowledge.propose_patch": {
          result = await this.knowledgeApi.proposePatch({
            projectId: this.projectId(input.args),
            targetPath: String(input.args.targetPath ?? "04-synthesis/current-synthesis.md"),
            proposedContent: String(input.args.proposedContent ?? ""),
            ingress: "mcp",
            actor: input.actor,
          });
          break;
        }

        case "knowledge.apply_patch": {
          result = await this.knowledgeApi.applyPatch({
            projectId: this.projectId(input.args),
            proposalId: String(input.args.proposalId ?? ""),
            approvalToken: String(input.args.approval_token ?? input.args.approvalToken ?? ""),
            ingress: "mcp",
            actor: input.actor,
          });
          break;
        }

        default:
          throw new Error(`Unknown MCP tool: ${input.name}`);
      }

      this.auditApi.recordEvent({
        projectId: toolProjectId,
        ingress: "mcp",
        action: "mcp.tool_call",
        actor: input.actor ?? "mcp-client",
        payload: {
          tool: input.name,
          status: "success",
        },
      });

      return result;
    } catch (error) {
      this.auditApi.recordEvent({
        projectId: toolProjectId,
        ingress: "mcp",
        action: "mcp.tool_call",
        actor: input.actor ?? "mcp-client",
        payload: {
          tool: input.name,
          status: "failure",
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private startJob(input: {
    projectId: string;
    action: AiJobAction;
    stream: () => AsyncGenerator<AiStreamEvent>;
  }): { jobId: string; status: AiJobStatus; action: AiJobAction } {
    this.pruneJobs();

    const startedAt = nowIso();
    const record: AiJobRecord = {
      jobId: randomId("ai_job"),
      projectId: input.projectId,
      action: input.action,
      status: "running",
      startedAt,
      updatedAt: startedAt,
      latestStage: "queued",
      percent: 0,
      tokenPreview: "",
      events: [],
    };

    this.jobs.set(record.jobId, record);
    void this.runJob(record, input.stream);

    return {
      jobId: record.jobId,
      status: record.status,
      action: record.action,
    };
  }

  private async runJob(
    record: AiJobRecord,
    streamFactory: () => AsyncGenerator<AiStreamEvent>,
  ): Promise<void> {
    try {
      for await (const event of streamFactory()) {
        this.pushEvent(record, event);

        if (event.type === "done") {
          record.status = "succeeded";
          record.result = event.result;
          record.percent = 100;
          record.updatedAt = nowIso();
          return;
        }

        if (event.type === "error") {
          record.status = "failed";
          record.error = event.error;
          record.updatedAt = nowIso();
          return;
        }
      }

      if (record.status === "running") {
        record.status = "failed";
        record.error = "Job ended without a terminal event";
        record.updatedAt = nowIso();
      }
    } catch (error) {
      record.status = "failed";
      record.error = error instanceof Error ? error.message : String(error);
      record.events.push({
        type: "error",
        action: record.action,
        error: record.error,
      });
      record.updatedAt = nowIso();
    }
  }

  private pushEvent(record: AiJobRecord, event: AiStreamEvent): void {
    record.events.push(event);
    if (record.events.length > MAX_JOB_EVENTS) {
      record.events.splice(0, record.events.length - MAX_JOB_EVENTS);
    }

    if (event.type === "stage") {
      record.latestStage = event.stage;
      record.percent = event.percent;
    }

    if (event.type === "token") {
      const combined = `${record.tokenPreview}${event.text}`;
      record.tokenPreview = combined.slice(-MAX_TOKEN_PREVIEW);
    }

    if (event.type === "error") {
      record.error = event.error;
    }

    if (event.type === "done") {
      record.result = event.result;
      record.percent = 100;
      record.latestStage = "done";
    }

    record.updatedAt = nowIso();
  }

  private getJob(projectId: string, jobId: string): unknown {
    this.pruneJobs();

    const job = this.jobs.get(jobId);
    if (!job || job.projectId !== projectId) {
      throw new Error(`AI job not found: ${jobId}`);
    }

    return {
      jobId: job.jobId,
      action: job.action,
      status: job.status,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      latestStage: job.latestStage,
      percent: job.percent,
      tokenPreview: job.tokenPreview,
      events: job.events,
      result: job.result,
      error: job.error,
    };
  }

  private pruneJobs(): void {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === "running") {
        continue;
      }
      if (now - new Date(job.updatedAt).getTime() > FINISHED_JOB_TTL_MS) {
        this.jobs.delete(jobId);
      }
    }
  }

  private async *streamChatJob(input: {
    projectId: string;
    question: string;
    threadId?: string;
    actor?: string;
  }): AsyncGenerator<AiStreamEvent> {
    const action = "chat_turn" as const;
    const startedAt = Date.now();
    let metadata: { turnId: string; threadId: string; citations: unknown[] } | null = null;

    yield {
      type: "stage",
      action,
      stage: "prepare",
      message: "Preparing grounded response",
      percent: 5,
      at: nowIso(),
    };

    for await (const event of this.conversationApi.streamTurn({
      projectId: input.projectId,
      question: input.question,
      threadId: input.threadId,
      ingress: "mcp",
      actor: input.actor,
    })) {
      if (event.type === "metadata") {
        metadata = event;
        yield {
          type: "stage",
          action,
          stage: "retrieval_complete",
          message: "Evidence retrieved",
          percent: 40,
          at: nowIso(),
        };
        yield {
          type: "artifact",
          action,
          name: "metadata",
          data: event,
        };
        yield {
          type: "stage",
          action,
          stage: "generate",
          message: "Generating response",
          percent: 70,
          at: nowIso(),
        };
        continue;
      }

      if (event.type === "token") {
        yield {
          type: "token",
          action,
          text: event.text,
        };
        continue;
      }

      if (event.type === "done") {
        yield {
          type: "stage",
          action,
          stage: "finalize",
          message: "Finalizing response",
          percent: 95,
          at: nowIso(),
        };
        yield {
          type: "done",
          action,
          source: "codex",
          durationMs: Date.now() - startedAt,
          result: {
            response: event.response,
            turnId: metadata?.turnId ?? "",
            threadId: metadata?.threadId ?? "",
            citations: metadata?.citations ?? [],
          },
        };
      }
    }
  }

  private assertProjectId(args: Record<string, unknown>): void {
    if (!args.projectId || typeof args.projectId !== "string") {
      throw new Error("projectId is required for this tool");
    }
  }

  private projectId(args: Record<string, unknown>): string {
    this.assertProjectId(args);
    return String(args.projectId);
  }
}
