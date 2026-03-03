import type { AuditDocsApi } from "../audit-docs/api";
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

export class McpInterfaceApi {
  constructor(
    private readonly workspaceApi: WorkspaceApi,
    private readonly retrievalApi: RetrievalApi,
    private readonly knowledgeApi: KnowledgeApi,
    private readonly reportImportApi: ReportImportApi,
    private readonly externalResearchApi: ExternalResearchApi,
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
      {
        name: "external_query.draft",
        description: "Create reviewable query draft",
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

        case "external_query.draft": {
          result = await this.externalResearchApi.draftResearchQuery({
            projectId: this.projectId(input.args),
            goal: String(input.args.goal ?? "Research gap follow-up"),
            userRequest: input.args.userRequest ? String(input.args.userRequest) : undefined,
            ingress: "mcp",
            actor: input.actor,
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
