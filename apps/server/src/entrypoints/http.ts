import { access } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DomainError } from "@helix/shared-kernel";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { AppContainer } from "../shared/infrastructure/app-container";

const currentDir = dirname(fileURLToPath(import.meta.url));
const webDistDir = resolve(currentDir, "../../../../apps/web/dist");
const webIndexPath = resolve(webDistDir, "index.html");

const safeResolveWebPath = (requestPath: string): string | null => {
  const normalized = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const absolutePath = resolve(webDistDir, normalized);
  const webRootPrefix = `${webDistDir}${sep}`;

  if (absolutePath !== webDistDir && !absolutePath.startsWith(webRootPrefix)) {
    return null;
  }

  return absolutePath;
};

const readWebFile = async (absolutePath: string): Promise<Response | null> => {
  try {
    await access(absolutePath);
    const file = Bun.file(absolutePath);
    const contentType = file.type;
    return new Response(file, contentType ? { headers: { "Content-Type": contentType } } : {});
  } catch {
    return null;
  }
};

export const createHttpApp = (container: AppContainer = new AppContainer()): Hono => {
  const app = new Hono();
  app.use("*", cors());

  app.get("/health", (c) => c.json({ ok: true, service: "helix-server" }));

  app.get("/api/projects", (c) => c.json({ projects: container.workspaceApi.listProjects() }));

  app.post("/api/projects", async (c) => {
    const body = await c.req.json();
    const project = await container.workspaceApi.createProject({
      name: String(body.name ?? "Untitled Project"),
      vaultRoot: body.vaultRoot ? String(body.vaultRoot) : undefined,
      actor: "user",
      ingress: "http",
    });
    await container.retrievalApi.reindexProject(project.projectId);
    return c.json({ project }, 201);
  });

  app.get("/api/projects/:projectId/overview", (c) => {
    const overview = container.workspaceApi.getProjectOverview(c.req.param("projectId"));
    return c.json(overview);
  });

  app.post("/api/projects/:projectId/attach-vault", async (c) => {
    const body = await c.req.json();
    const project = await container.workspaceApi.attachVaultFolder({
      projectId: c.req.param("projectId"),
      vaultPath: String(body.vaultPath),
      actor: "user",
      ingress: "http",
    });
    await container.retrievalApi.reindexProject(project.projectId);
    return c.json({ project });
  });

  app.get("/api/projects/:projectId/tree", async (c) => {
    const project = container.workspaceApi.getProject(c.req.param("projectId"));
    const tree = await container.vaultApi.readProjectTree(project.vaultPath);
    return c.json({ tree });
  });

  app.post("/api/projects/:projectId/reports/import", async (c) => {
    const body = await c.req.json();
    const report = await container.reportImportApi.importReport({
      projectId: c.req.param("projectId"),
      sourceType: String(body.sourceType ?? "external"),
      originalFilename: String(body.originalFilename ?? "report.md"),
      content: body.content ? String(body.content) : undefined,
      sourcePath: body.sourcePath ? String(body.sourcePath) : undefined,
      ingress: "http",
      actor: "user",
    });
    return c.json({ report }, 201);
  });

  app.get("/api/projects/:projectId/reports", (c) => {
    const reports = container.reportImportApi.listReports(c.req.param("projectId"));
    return c.json({ reports });
  });

  app.get("/api/projects/:projectId/reports/:reportId", (c) => {
    const report = container.reportImportApi.getReport(
      c.req.param("projectId"),
      c.req.param("reportId"),
    );
    return c.json({ report });
  });

  app.get("/api/projects/:projectId/reports/:reportId/content", async (c) => {
    const content = await container.reportImportApi.getReportContent(
      c.req.param("projectId"),
      c.req.param("reportId"),
    );
    return c.json(content);
  });

  app.get("/api/projects/:projectId/findings", (c) => {
    const findings = container.knowledgeApi.listFindings(c.req.param("projectId"));
    return c.json({ findings });
  });

  app.post("/api/projects/:projectId/findings", async (c) => {
    const body = await c.req.json();
    const finding = container.knowledgeApi.registerFinding({
      projectId: c.req.param("projectId"),
      statement: String(body.statement),
      status: body.status ?? "tentative",
      citations: Array.isArray(body.citations) ? body.citations : [],
      isHypothesis: Boolean(body.isHypothesis),
      tags: Array.isArray(body.tags) ? body.tags : [],
      ingress: "http",
      actor: "user",
    });
    return c.json({ finding }, 201);
  });

  app.post("/api/projects/:projectId/findings/draft/stream", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return streamSSE(c, async (stream) => {
      try {
        for await (const event of container.knowledgeApi.streamDraftFindings({
          projectId: c.req.param("projectId"),
          maxItems: Number(body.maxItems ?? 5),
          ingress: "http",
          actor: "user",
          signal: c.req.raw.signal,
        })) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            action: "findings_draft",
            error: error instanceof Error ? error.message : String(error),
            code: error instanceof DomainError ? error.code : undefined,
          }),
        });
      }
    });
  });

  app.get("/api/projects/:projectId/synthesis", async (c) => {
    const synthesis = await container.knowledgeApi.getSynthesis(c.req.param("projectId"));
    return c.json(synthesis);
  });

  app.put("/api/projects/:projectId/synthesis", async (c) => {
    const body = await c.req.json();
    const doc = await container.knowledgeApi.updateSynthesis({
      projectId: c.req.param("projectId"),
      content: String(body.content),
      confidence: Number(body.confidence ?? 0.5),
      ingress: "http",
      actor: "user",
    });
    return c.json({ doc });
  });

  app.post("/api/projects/:projectId/synthesis/draft/stream", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return streamSSE(c, async (stream) => {
      try {
        for await (const event of container.knowledgeApi.streamDraftSynthesis({
          projectId: c.req.param("projectId"),
          selectedFindingIds: Array.isArray(body.selectedFindingIds) ? body.selectedFindingIds : [],
          ingress: "http",
          actor: "user",
          signal: c.req.raw.signal,
        })) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            action: "synthesis_draft",
            error: error instanceof Error ? error.message : String(error),
            code: error instanceof DomainError ? error.code : undefined,
          }),
        });
      }
    });
  });

  app.get("/api/projects/:projectId/search", async (c) => {
    const question = String(c.req.query("q") ?? "");
    const maxItems = Number(c.req.query("max") ?? 8);
    const items = await container.retrievalApi.retrieveContext({
      projectId: c.req.param("projectId"),
      question,
      maxItems,
      ingress: "http",
      actor: "user",
    });
    return c.json({ items });
  });

  app.get("/api/projects/:projectId/threads", (c) => {
    const threads = container.conversationApi.listThreads(c.req.param("projectId"));
    return c.json({
      threads,
    });
  });

  app.get("/api/projects/:projectId/threads/:threadId/turns", (c) => {
    const turns = container.conversationApi.listTurns(
      c.req.param("projectId"),
      c.req.param("threadId"),
    );
    return c.json({ turns });
  });

  app.post("/api/projects/:projectId/chat/stream", async (c) => {
    const body = await c.req.json();
    const question = String(body.question ?? "");
    const threadId = body.threadId ? String(body.threadId) : undefined;
    const startedAt = Date.now();

    return streamSSE(c, async (stream) => {
      let metadata:
        | { turnId: string; threadId: string; citations: unknown[] }
        | null = null;

      await stream.writeSSE({
        event: "stage",
        data: JSON.stringify({
          type: "stage",
          action: "chat_turn",
          stage: "prepare",
          message: "Preparing grounded response",
          percent: 5,
          at: new Date().toISOString(),
        }),
      });

      try {
        for await (const event of container.conversationApi.streamTurn({
          projectId: c.req.param("projectId"),
          question,
          threadId,
          ingress: "http",
          actor: "user",
          signal: c.req.raw.signal,
        })) {
          if (event.type === "metadata") {
            metadata = event;
            await stream.writeSSE({
              event: "stage",
              data: JSON.stringify({
                type: "stage",
                action: "chat_turn",
                stage: "retrieval_complete",
                message: "Evidence retrieved",
                percent: 40,
                at: new Date().toISOString(),
              }),
            });
            await stream.writeSSE({
              event: "artifact",
              data: JSON.stringify({
                type: "artifact",
                action: "chat_turn",
                name: "metadata",
                data: event,
              }),
            });
            await stream.writeSSE({
              event: "stage",
              data: JSON.stringify({
                type: "stage",
                action: "chat_turn",
                stage: "generate",
                message: "Generating response",
                percent: 70,
                at: new Date().toISOString(),
              }),
            });
            continue;
          }

          if (event.type === "token") {
            await stream.writeSSE({
              event: "token",
              data: JSON.stringify({
                type: "token",
                action: "chat_turn",
                text: event.text,
              }),
            });
            continue;
          }

          if (event.type === "done") {
            await stream.writeSSE({
              event: "stage",
              data: JSON.stringify({
                type: "stage",
                action: "chat_turn",
                stage: "finalize",
                message: "Finalizing response",
                percent: 95,
                at: new Date().toISOString(),
              }),
            });
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({
                type: "done",
                action: "chat_turn",
                source: "codex",
                durationMs: Date.now() - startedAt,
                result: {
                  response: event.response,
                  turnId: metadata?.turnId ?? "",
                  threadId: metadata?.threadId ?? "",
                  citations: metadata?.citations ?? [],
                },
              }),
            });
          }
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            action: "chat_turn",
            error: error instanceof Error ? error.message : String(error),
            code: error instanceof DomainError ? error.code : undefined,
          }),
        });
      }
    });
  });

  app.post("/api/projects/:projectId/external-query/draft/stream", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return streamSSE(c, async (stream) => {
      try {
        for await (const event of container.externalResearchApi.streamDraftResearchQuery({
          projectId: c.req.param("projectId"),
          goal: String(body.goal ?? "Research next steps"),
          userRequest: body.userRequest ? String(body.userRequest) : undefined,
          ingress: "http",
          actor: "user",
          signal: c.req.raw.signal,
        })) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            action: "external_query_draft",
            error: error instanceof Error ? error.message : String(error),
            code: error instanceof DomainError ? error.code : undefined,
          }),
        });
      }
    });
  });

  app.get("/api/projects/:projectId/external-query/drafts", (c) => {
    const drafts = container.externalResearchApi.listDrafts(c.req.param("projectId"));
    return c.json({ drafts });
  });

  app.post("/api/projects/:projectId/external-query/trigger", async (c) => {
    const body = await c.req.json();
    const result = await container.externalResearchApi.triggerTool({
      projectId: c.req.param("projectId"),
      queryDraftId: String(body.queryDraftId),
      ingress: "http",
      actor: "user",
    });
    return c.json({ result });
  });

  app.post("/api/projects/:projectId/knowledge/patch/propose", async (c) => {
    const body = await c.req.json();
    const proposal = await container.knowledgeApi.proposePatch({
      projectId: c.req.param("projectId"),
      targetPath: String(body.targetPath),
      proposedContent: String(body.proposedContent),
      ingress: "http",
      actor: "user",
    });
    const approvalToken = await container.knowledgeApi.createApprovalToken(
      c.req.param("projectId"),
      "knowledge.apply_patch",
    );
    return c.json({
      proposal,
      approvalToken,
      message: "Review patch, then call apply with approval token.",
    });
  });

  app.post("/api/projects/:projectId/knowledge/patch/apply", async (c) => {
    const body = await c.req.json();
    const result = await container.knowledgeApi.applyPatch({
      projectId: c.req.param("projectId"),
      proposalId: String(body.proposalId),
      approvalToken: String(body.approvalToken),
      ingress: "http",
      actor: "user",
    });
    return c.json({ result });
  });

  app.get("/api/projects/:projectId/audit/events", (c) => {
    const events = container.auditApi.tailEvents(
      c.req.param("projectId"),
      Number(c.req.query("limit") ?? 30),
    );
    return c.json({ events });
  });

  app.get("*", async (c) => {
    const assetPath = safeResolveWebPath(c.req.path);
    if (assetPath) {
      const assetResponse = await readWebFile(assetPath);
      if (assetResponse) {
        return assetResponse;
      }
    }

    const acceptsHtml = c.req.header("accept")?.includes("text/html") ?? false;
    if (!acceptsHtml) {
      return c.notFound();
    }

    const indexResponse = await readWebFile(webIndexPath);
    if (indexResponse) {
      return indexResponse;
    }

    return c.json(
      {
        error:
          "Web app build not found. Run `bun run --filter @helix/web build` before starting the server.",
      },
      503,
    );
  });

  app.onError((error, c) => {
    if (error instanceof DomainError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    return c.json({ error: error.message }, 500);
  });

  return app;
};

const app = createHttpApp();
const port = Number(process.env.PORT ?? 8787);
const requestedIdleTimeout = Number(process.env.HELIX_HTTP_IDLE_TIMEOUT_SECONDS ?? 240);
const idleTimeout = Math.max(1, Math.min(255, requestedIdleTimeout));

console.log(`Helix server listening on http://localhost:${port}`);

export default {
  port,
  idleTimeout,
  fetch: app.fetch,
};
