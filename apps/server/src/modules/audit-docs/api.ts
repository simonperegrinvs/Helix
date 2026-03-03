import type { AuditEvent } from "@helix/contracts";
import { randomId } from "@helix/shared-kernel";
import type { DatabaseClient } from "../../shared/infrastructure/database";

interface RecordEventInput {
  projectId: string;
  correlationId?: string;
  ingress: "http" | "mcp";
  action: string;
  actor: string;
  payload: Record<string, unknown>;
}

export class AuditDocsApi {
  constructor(private readonly database: DatabaseClient) {}

  recordEvent(input: RecordEventInput): AuditEvent {
    const event: AuditEvent = {
      id: randomId("audit"),
      projectId: input.projectId,
      correlationId: input.correlationId ?? randomId("corr"),
      ingress: input.ingress,
      action: input.action,
      actor: input.actor,
      payload: input.payload,
      createdAt: new Date().toISOString(),
    };

    const stmt = this.database.db.query(
      `INSERT INTO audit_events (id, project_id, correlation_id, ingress, action, actor, payload_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    );
    stmt.run(
      event.id,
      event.projectId,
      event.correlationId,
      event.ingress,
      event.action,
      event.actor,
      JSON.stringify(event.payload),
      event.createdAt,
    );
    return event;
  }

  tailEvents(projectId: string, limit = 30): AuditEvent[] {
    const stmt = this.database.db.query(
      `SELECT id, project_id, correlation_id, ingress, action, actor, payload_json, created_at
       FROM audit_events
       WHERE project_id = ?1
       ORDER BY created_at DESC
       LIMIT ?2`,
    );
    const rows = stmt.all(projectId, limit) as Array<{
      id: string;
      project_id: string;
      correlation_id: string;
      ingress: "http" | "mcp";
      action: string;
      actor: string;
      payload_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      correlationId: row.correlation_id,
      ingress: row.ingress,
      action: row.action,
      actor: row.actor,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    }));
  }
}
