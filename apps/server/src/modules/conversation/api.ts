import type { RetrievedContextItem } from "@helix/contracts";
import { nowIso, randomId } from "@helix/shared-kernel";
import type { DatabaseClient } from "../../shared/infrastructure/database";
import type { AuditDocsApi } from "../audit-docs/api";
import type { KnowledgeApi } from "../knowledge/api";
import type { RetrievalApi } from "../retrieval/api";
import type { VaultApi } from "../vault/api";
import type { WorkspaceApi } from "../workspace/api";
import type { CodexGateway } from "./application/codex-gateway";

export class ConversationApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly workspaceApi: WorkspaceApi,
    private readonly retrievalApi: RetrievalApi,
    private readonly knowledgeApi: KnowledgeApi,
    private readonly vaultApi: VaultApi,
    private readonly codexGateway: CodexGateway,
    private readonly auditApi: AuditDocsApi,
  ) {}

  listThreads(projectId: string): Array<{
    threadId: string;
    title: string;
    status: string;
    summary: string;
    lastTurnAt: string;
  }> {
    const rows = this.database.db
      .query(
        `SELECT thread_id, title, status, summary, last_turn_at
         FROM research_threads
         WHERE project_id = ?1
         ORDER BY last_turn_at DESC`,
      )
      .all(projectId) as Array<{
      thread_id: string;
      title: string;
      status: string;
      summary: string;
      last_turn_at: string;
    }>;

    return rows.map((row) => ({
      threadId: row.thread_id,
      title: row.title,
      status: row.status,
      summary: row.summary,
      lastTurnAt: row.last_turn_at,
    }));
  }

  listTurns(
    projectId: string,
    threadId: string,
  ): Array<{
    turnId: string;
    question: string;
    response: string;
    createdAt: string;
    citations: RetrievedContextItem[];
  }> {
    const rows = this.database.db
      .query(
        `SELECT turn_id, question, response, citations_json, created_at
         FROM conversation_turns
         WHERE project_id = ?1 AND thread_id = ?2
         ORDER BY created_at DESC`,
      )
      .all(projectId, threadId) as Array<{
      turn_id: string;
      question: string;
      response: string;
      citations_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      turnId: row.turn_id,
      question: row.question,
      response: row.response,
      createdAt: row.created_at,
      citations: JSON.parse(row.citations_json) as RetrievedContextItem[],
    }));
  }

  async *streamTurn(input: {
    projectId: string;
    question: string;
    threadId?: string;
    actor?: string;
    ingress?: "http" | "mcp";
    signal?: AbortSignal;
  }): AsyncGenerator<
    | { type: "metadata"; turnId: string; threadId: string; citations: RetrievedContextItem[] }
    | { type: "token"; text: string }
    | { type: "done"; response: string }
  > {
    const project = this.workspaceApi.getProject(input.projectId);
    const thread = this.resolveOrCreateThread(project.projectId, input.threadId);

    const projectCharter = await this.vaultApi
      .readNote(project.vaultPath, "00-project/project.md")
      .catch(() => "# Project\n");

    const synthesis = await this.knowledgeApi.getSynthesis(input.projectId);
    const citations = await this.retrievalApi.retrieveContext({
      projectId: input.projectId,
      question: input.question,
      maxItems: 8,
      ingress: input.ingress,
      actor: input.actor,
    });

    const packet = {
      systemRules: [
        "Use project evidence first.",
        "Attach citations to claims.",
        "Mark unsupported claims as hypotheses.",
      ],
      projectCharter,
      currentQuestion: input.question,
      threadSummary: thread.summary,
      retrievedEvidence: citations.map((citation) => ({
        filePath: citation.filePath,
        heading: citation.heading,
        excerpt: citation.excerpt,
      })),
      allowedTools: ["retrieveContext", "listEvidence"],
      outputContract: {
        mustCite: true,
        allowHypothesis: true,
      },
    };

    const turnId = randomId("turn");
    yield {
      type: "metadata",
      turnId,
      threadId: thread.threadId,
      citations,
    };

    let fullResponse = "";
    for await (const event of this.codexGateway.streamTurn({
      projectId: input.projectId,
      threadId: thread.threadId,
      packet,
      signal: input.signal,
    })) {
      if (event.type === "token" && event.text) {
        fullResponse += event.text;
        yield {
          type: "token",
          text: event.text,
        };
      }
      if (event.type === "message" && event.text) {
        fullResponse += `\n${event.text}`;
      }
    }

    const createdAt = nowIso();
    this.database.db
      .query(
        `INSERT INTO conversation_turns (turn_id, thread_id, project_id, question, response, citations_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .run(
        turnId,
        thread.threadId,
        input.projectId,
        input.question,
        fullResponse,
        JSON.stringify(citations),
        createdAt,
      );

    const nextSummary = this.summarize(thread.summary, input.question, fullResponse);
    this.database.db
      .query(
        `UPDATE research_threads
         SET summary = ?1, last_turn_at = ?2
         WHERE thread_id = ?3`,
      )
      .run(nextSummary, createdAt, thread.threadId);

    await this.vaultApi.appendSection(
      project.vaultPath,
      `05-conversations/thread-${thread.threadId}.md`,
      `## ${createdAt}\n\n**Q:** ${input.question}\n\n**A:** ${fullResponse.slice(0, 2000)}`,
    );

    this.auditApi.recordEvent({
      projectId: input.projectId,
      ingress: input.ingress ?? "http",
      action: "conversation.stream_turn",
      actor: input.actor ?? "user",
      payload: {
        threadId: thread.threadId,
        turnId,
        citationCount: citations.length,
      },
    });

    yield {
      type: "done",
      response: fullResponse,
    };
  }

  private resolveOrCreateThread(
    projectId: string,
    threadId?: string,
  ): {
    threadId: string;
    summary: string;
  } {
    if (threadId) {
      const row = this.database.db
        .query(
          `SELECT thread_id, summary
           FROM research_threads
           WHERE thread_id = ?1 AND project_id = ?2`,
        )
        .get(threadId, projectId) as {
        thread_id: string;
        summary: string;
      } | null;
      if (row) {
        return {
          threadId: row.thread_id,
          summary: row.summary,
        };
      }
    }

    const createdThreadId = randomId("thread");
    this.database.db
      .query(
        `INSERT INTO research_threads (thread_id, project_id, title, status, summary, last_turn_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .run(createdThreadId, projectId, "Research thread", "active", "No summary yet.", nowIso());

    return {
      threadId: createdThreadId,
      summary: "No summary yet.",
    };
  }

  private summarize(previousSummary: string, question: string, response: string): string {
    const combined = `${previousSummary}\nQ: ${question}\nA: ${response}`;
    return combined.length > 1200 ? combined.slice(combined.length - 1200) : combined;
  }
}
