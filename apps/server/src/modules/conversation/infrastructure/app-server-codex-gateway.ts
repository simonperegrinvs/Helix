import type { CodexGateway, CodexStreamEvent, PromptPacket } from "../application/codex-gateway";

interface RpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export class AppServerCodexGateway implements CodexGateway {
  async *streamTurn(input: {
    projectId: string;
    threadId: string;
    packet: PromptPacket;
    signal?: AbortSignal;
  }): AsyncGenerator<CodexStreamEvent, void, void> {
    const child = Bun.spawn(["codex", "app-server"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const initRequestId = `init-${Date.now()}`;
    const threadRequestId = `thread-${Date.now()}`;
    const turnRequestId = `turn-${Date.now()}`;
    let initialized = false;
    let remoteThreadId: string | null = null;
    let turnRequested = false;

    const initRequest: RpcRequest = {
      jsonrpc: "2.0",
      id: initRequestId,
      method: "initialize",
      params: {
        clientInfo: {
          name: "helix-server",
          version: "0.1.0",
        },
      },
    };

    child.stdin.write(`${JSON.stringify(initRequest)}\n`);

    const abortChild = () => {
      try {
        child.kill();
      } catch {
        // Best-effort abort.
      }
    };
    if (input.signal) {
      input.signal.addEventListener("abort", abortChild, { once: true });
    }

    const decoder = new TextDecoder();
    const reader = child.stdout.getReader();
    let pending = "";

    try {
      while (true) {
        if (input.signal?.aborted) {
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const message = JSON.parse(trimmed) as Record<string, unknown>;
            if (message.error && typeof message.error === "object") {
              const errorMessage = this.extractErrorMessage(message.error);
              yield {
                type: "message",
                text: `Codex app-server error: ${errorMessage}`,
              };
              yield { type: "done" };
              await child.stdin.end();
              return;
            }

            if (String(message.id ?? "") === initRequestId) {
              initialized = true;
              const threadRequest: RpcRequest = {
                jsonrpc: "2.0",
                id: threadRequestId,
                method: "thread/start",
                params: {},
              };
              child.stdin.write(`${JSON.stringify(threadRequest)}\n`);
              continue;
            }

            if (String(message.id ?? "") === threadRequestId) {
              remoteThreadId = this.extractThreadId(message.result) ?? null;
              if (!remoteThreadId) {
                yield {
                  type: "message",
                  text: "Codex app-server error: missing thread id in thread/start response",
                };
                yield { type: "done" };
                await child.stdin.end();
                return;
              }

              const turnRequest: RpcRequest = {
                jsonrpc: "2.0",
                id: turnRequestId,
                method: "turn/start",
                params: {
                  threadId: remoteThreadId,
                  input: [
                    {
                      type: "text",
                      text: this.buildTurnInput(input.packet),
                    },
                  ],
                },
              };
              child.stdin.write(`${JSON.stringify(turnRequest)}\n`);
              turnRequested = true;
              continue;
            }

            if (!initialized || !turnRequested) {
              continue;
            }

            const deltaText = this.extractDeltaText(message);
            if (deltaText) {
              yield { type: "token", text: deltaText };
            }

            if (
              message.method === "turn/completed" ||
              message.type === "done" ||
              (String(message.id ?? "") === turnRequestId &&
                this.isTurnResponseTerminal(message.result))
            ) {
              yield { type: "done" };
              await child.stdin.end();
              return;
            }
          } catch {
            yield { type: "token", text: trimmed };
          }
        }
      }

      const stderrText = decoder.decode(await new Response(child.stderr).arrayBuffer()).trim();
      await child.exited;

      if (stderrText.length > 0) {
        yield {
          type: "message",
          text: `Codex app-server stderr: ${stderrText}`,
        };
      }

      yield { type: "done" };
    } finally {
      if (input.signal) {
        input.signal.removeEventListener("abort", abortChild);
      }
    }
  }

  private extractThreadId(result: unknown): string | undefined {
    if (!result || typeof result !== "object") {
      return undefined;
    }

    const row = result as Record<string, unknown>;
    if (typeof row.threadId === "string") {
      return row.threadId;
    }

    if (row.thread && typeof row.thread === "object") {
      const thread = row.thread as Record<string, unknown>;
      if (typeof thread.id === "string") {
        return thread.id;
      }
    }

    return undefined;
  }

  private isTurnResponseTerminal(result: unknown): boolean {
    if (!result || typeof result !== "object") {
      return false;
    }
    const row = result as Record<string, unknown>;
    if (row.turn && typeof row.turn === "object") {
      const turn = row.turn as Record<string, unknown>;
      return turn.status === "completed" || turn.status === "failed" || turn.status === "canceled";
    }
    return false;
  }

  private extractDeltaText(message: Record<string, unknown>): string | undefined {
    if (typeof message.delta === "string") {
      return message.delta;
    }

    if (typeof message.text === "string") {
      return message.text;
    }

    if (message.params && typeof message.params === "object") {
      const params = message.params as Record<string, unknown>;
      if (typeof params.delta === "string") {
        return params.delta;
      }
      if (typeof params.text === "string") {
        return params.text;
      }
      if (params.msg && typeof params.msg === "object") {
        const msg = params.msg as Record<string, unknown>;
        if (typeof msg.delta === "string") {
          return msg.delta;
        }
        if (typeof msg.text === "string") {
          return msg.text;
        }
      }
      if (params.item && typeof params.item === "object") {
        const item = params.item as Record<string, unknown>;
        if (typeof item.text === "string") {
          return item.text;
        }
        if (typeof item.output_text === "string") {
          return item.output_text;
        }
        if (Array.isArray(item.content)) {
          const textFromContent = item.content
            .map((entry) =>
              entry && typeof entry === "object"
                ? String((entry as Record<string, unknown>).text ?? "")
                : "",
            )
            .join("")
            .trim();
          if (textFromContent.length > 0) {
            return textFromContent;
          }
        }
      }
    }

    return undefined;
  }

  private extractErrorMessage(error: unknown): string {
    if (!error || typeof error !== "object") {
      return String(error ?? "unknown");
    }
    const row = error as Record<string, unknown>;
    if (typeof row.message === "string") {
      return row.message;
    }
    return JSON.stringify(error);
  }

  private buildTurnInput(packet: PromptPacket): string {
    const evidence = packet.retrievedEvidence
      .slice(0, 8)
      .map((item) => `- ${item.filePath} · ${item.heading}: ${item.excerpt}`)
      .join("\n");

    return [
      "System rules:",
      ...packet.systemRules.map((rule) => `- ${rule}`),
      "",
      `Project charter:\n${packet.projectCharter}`,
      "",
      `Thread summary:\n${packet.threadSummary}`,
      "",
      `Question:\n${packet.currentQuestion}`,
      "",
      "Evidence:",
      evidence || "- None",
    ].join("\n");
  }
}
