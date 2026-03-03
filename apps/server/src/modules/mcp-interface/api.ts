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

    switch (input.name) {
      case "projects.list":
        return this.workspaceApi.listProjects();

      case "projects.get_manifest": {
        const projectId = this.projectId(input.args);
        const project = this.workspaceApi.getProject(projectId);
        return {
          projectId,
          vaultPath: `${project.vaultPath}/.research/manifest.json`,
        };
      }

      case "projects.get_overview": {
        return this.workspaceApi.getProjectOverview(this.projectId(input.args));
      }

      case "project.search": {
        const projectId = this.projectId(input.args);
        return this.retrievalApi.retrieveContext({
          projectId,
          question: String(input.args.question ?? ""),
          maxItems: Number(input.args.maxItems ?? 8),
          ingress: "mcp",
          actor: input.actor,
        });
      }

      case "project.get_synthesis": {
        return this.knowledgeApi.getSynthesis(this.projectId(input.args));
      }

      case "reports.list": {
        return this.reportImportApi.listReports(this.projectId(input.args));
      }

      case "reports.get": {
        return this.reportImportApi.getReport(
          this.projectId(input.args),
          String(input.args.reportId ?? ""),
        );
      }

      case "audit.tail": {
        return this.auditApi.tailEvents(this.projectId(input.args), Number(input.args.limit ?? 20));
      }

      case "external_query.draft": {
        return this.externalResearchApi.draftResearchQuery({
          projectId: this.projectId(input.args),
          goal: String(input.args.goal ?? "Research gap follow-up"),
          userRequest: input.args.userRequest ? String(input.args.userRequest) : undefined,
          ingress: "mcp",
          actor: input.actor,
        });
      }

      case "import_report.register": {
        return this.reportImportApi.importReport({
          projectId: this.projectId(input.args),
          sourceType: String(input.args.sourceType ?? "external"),
          originalFilename: String(input.args.originalFilename ?? "report.md"),
          content: input.args.content ? String(input.args.content) : undefined,
          sourcePath: input.args.sourcePath ? String(input.args.sourcePath) : undefined,
          ingress: "mcp",
          actor: input.actor,
        });
      }

      case "knowledge.propose_patch": {
        return this.knowledgeApi.proposePatch({
          projectId: this.projectId(input.args),
          targetPath: String(input.args.targetPath ?? "04-synthesis/current-synthesis.md"),
          proposedContent: String(input.args.proposedContent ?? ""),
          ingress: "mcp",
          actor: input.actor,
        });
      }

      case "knowledge.apply_patch": {
        return this.knowledgeApi.applyPatch({
          projectId: this.projectId(input.args),
          proposalId: String(input.args.proposalId ?? ""),
          approvalToken: String(input.args.approval_token ?? input.args.approvalToken ?? ""),
          ingress: "mcp",
          actor: input.actor,
        });
      }

      default:
        throw new Error(`Unknown MCP tool: ${input.name}`);
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
