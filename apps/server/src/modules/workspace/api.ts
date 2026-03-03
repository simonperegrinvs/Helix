import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ResearchProject } from "@helix/contracts";
import { DomainError, nowIso, randomId, toSlug } from "@helix/shared-kernel";
import type { DatabaseClient } from "../../shared/infrastructure/database";
import type { AuditDocsApi } from "../audit-docs/api";
import type { VaultApi } from "../vault/api";

const DEFAULT_VAULT_ROOT =
  process.env.HELIX_VAULT_ROOT ?? `${process.cwd()}/apps/server/data/vaults`;

export interface ProjectOverview {
  project: ResearchProject;
  stats: {
    reports: number;
    findings: number;
    threads: number;
    queries: number;
  };
}

export class WorkspaceApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly vaultApi: VaultApi,
    private readonly auditApi: AuditDocsApi,
  ) {}

  async createProject(input: {
    name: string;
    vaultRoot?: string;
    actor?: string;
    ingress?: "http" | "mcp";
  }): Promise<ResearchProject> {
    const slug = toSlug(input.name);
    const projectId = randomId("project");
    const vaultRoot = input.vaultRoot ? resolve(input.vaultRoot) : DEFAULT_VAULT_ROOT;
    const projectVaultPath = join(vaultRoot, slug);
    await mkdir(vaultRoot, { recursive: true });
    await this.vaultApi.ensureProjectStructure(projectVaultPath, input.name, slug);

    const project: ResearchProject = {
      projectId,
      name: input.name,
      slug,
      vaultPath: projectVaultPath,
      status: "active",
      createdAt: nowIso(),
      settings: {
        evidenceMode: "strict",
        retrievalMaxItems: 10,
      },
    };

    const stmt = this.database.db.query(
      `INSERT INTO projects (project_id, name, slug, vault_path, status, created_at, settings_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    );
    stmt.run(
      project.projectId,
      project.name,
      project.slug,
      project.vaultPath,
      project.status,
      project.createdAt,
      JSON.stringify(project.settings),
    );

    this.auditApi.recordEvent({
      projectId: project.projectId,
      ingress: input.ingress ?? "http",
      action: "workspace.create_project",
      actor: input.actor ?? "system",
      payload: {
        name: project.name,
        slug: project.slug,
      },
    });

    return project;
  }

  listProjects(): ResearchProject[] {
    const rows = this.database.db
      .query(
        `SELECT project_id, name, slug, vault_path, status, created_at, settings_json
         FROM projects
         ORDER BY created_at DESC`,
      )
      .all() as Array<{
      project_id: string;
      name: string;
      slug: string;
      vault_path: string;
      status: "active" | "archived";
      created_at: string;
      settings_json: string;
    }>;

    return rows.map((row) => ({
      projectId: row.project_id,
      name: row.name,
      slug: row.slug,
      vaultPath: row.vault_path,
      status: row.status,
      createdAt: row.created_at,
      settings: JSON.parse(row.settings_json),
    }));
  }

  getProject(projectId: string): ResearchProject {
    const row = this.database.db
      .query(
        `SELECT project_id, name, slug, vault_path, status, created_at, settings_json
         FROM projects WHERE project_id = ?1`,
      )
      .get(projectId) as {
      project_id: string;
      name: string;
      slug: string;
      vault_path: string;
      status: "active" | "archived";
      created_at: string;
      settings_json: string;
    } | null;

    if (!row) {
      throw new DomainError(`Project not found: ${projectId}`, "WORKSPACE_PROJECT_NOT_FOUND");
    }

    return {
      projectId: row.project_id,
      name: row.name,
      slug: row.slug,
      vaultPath: row.vault_path,
      status: row.status,
      createdAt: row.created_at,
      settings: JSON.parse(row.settings_json),
    };
  }

  async attachVaultFolder(input: {
    projectId: string;
    vaultPath: string;
    actor?: string;
    ingress?: "http" | "mcp";
  }): Promise<ResearchProject> {
    const project = this.getProject(input.projectId);
    const nextVaultPath = resolve(input.vaultPath);
    await this.vaultApi.ensureProjectStructure(nextVaultPath, project.name, project.slug);

    this.database.db
      .query("UPDATE projects SET vault_path = ?1 WHERE project_id = ?2")
      .run(nextVaultPath, project.projectId);

    this.auditApi.recordEvent({
      projectId: project.projectId,
      ingress: input.ingress ?? "http",
      action: "workspace.attach_vault_folder",
      actor: input.actor ?? "system",
      payload: {
        vaultPath: nextVaultPath,
      },
    });

    return this.getProject(project.projectId);
  }

  getProjectOverview(projectId: string): ProjectOverview {
    const project = this.getProject(projectId);

    const count = (table: string, key = "project_id"): number => {
      const row = this.database.db
        .query(`SELECT COUNT(*) as c FROM ${table} WHERE ${key} = ?1`)
        .get(projectId) as { c: number };
      return row.c;
    };

    return {
      project,
      stats: {
        reports: count("imported_reports"),
        findings: count("findings"),
        threads: count("research_threads"),
        queries: count("external_query_drafts"),
      },
    };
  }
}
