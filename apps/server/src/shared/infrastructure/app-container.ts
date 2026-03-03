import { AuditDocsApi } from "../../modules/audit-docs/api";
import { ConversationApi } from "../../modules/conversation/api";
import { AppServerCodexGateway } from "../../modules/conversation/infrastructure/app-server-codex-gateway";
import { FakeCodexGateway } from "../../modules/conversation/infrastructure/fake-codex-gateway";
import { ExternalResearchApi } from "../../modules/external-research/api";
import { KnowledgeApi } from "../../modules/knowledge/api";
import { McpInterfaceApi } from "../../modules/mcp-interface/api";
import { ReportImportApi } from "../../modules/report-import/api";
import { RetrievalApi } from "../../modules/retrieval/api";
import { VaultApi } from "../../modules/vault/api";
import { WorkspaceApi } from "../../modules/workspace/api";
import { DatabaseClient, defaultDbPath } from "./database";

export class AppContainer {
  readonly database: DatabaseClient;
  readonly vaultApi: VaultApi;
  readonly auditApi: AuditDocsApi;
  readonly workspaceApi: WorkspaceApi;
  readonly retrievalApi: RetrievalApi;
  readonly knowledgeApi: KnowledgeApi;
  readonly reportImportApi: ReportImportApi;
  readonly externalResearchApi: ExternalResearchApi;
  readonly conversationApi: ConversationApi;
  readonly mcpInterfaceApi: McpInterfaceApi;

  constructor() {
    this.database = new DatabaseClient({ path: defaultDbPath() });
    this.database.migrate();

    this.vaultApi = new VaultApi();
    this.auditApi = new AuditDocsApi(this.database);
    this.workspaceApi = new WorkspaceApi(this.database, this.vaultApi, this.auditApi);
    this.retrievalApi = new RetrievalApi(
      this.database,
      this.workspaceApi,
      this.vaultApi,
      this.auditApi,
    );
    this.knowledgeApi = new KnowledgeApi(
      this.database,
      this.workspaceApi,
      this.vaultApi,
      this.auditApi,
    );
    this.reportImportApi = new ReportImportApi(
      this.database,
      this.workspaceApi,
      this.vaultApi,
      this.retrievalApi,
      this.auditApi,
    );
    this.externalResearchApi = new ExternalResearchApi(
      this.database,
      this.workspaceApi,
      this.retrievalApi,
      this.knowledgeApi,
      this.vaultApi,
      this.auditApi,
    );
    const codexGateway =
      process.env.HELIX_FAKE_CODEX === "1" ? new FakeCodexGateway() : new AppServerCodexGateway();
    this.conversationApi = new ConversationApi(
      this.database,
      this.workspaceApi,
      this.retrievalApi,
      this.knowledgeApi,
      this.vaultApi,
      codexGateway,
      this.auditApi,
    );
    this.mcpInterfaceApi = new McpInterfaceApi(
      this.workspaceApi,
      this.retrievalApi,
      this.knowledgeApi,
      this.reportImportApi,
      this.externalResearchApi,
      this.auditApi,
    );
  }
}
