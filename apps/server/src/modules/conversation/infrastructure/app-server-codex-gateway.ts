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
  }): AsyncGenerator<CodexStreamEvent, void, void> {
    const child = Bun.spawn(["codex", "app-server"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const request: RpcRequest = {
      jsonrpc: "2.0",
      id: `turn-${Date.now()}`,
      method: "turn/start",
      params: {
        threadId: input.threadId,
        promptPacket: input.packet,
        metadata: {
          projectId: input.projectId,
        },
      },
    };

    child.stdin.write(`${JSON.stringify(request)}\n`);

    const decoder = new TextDecoder();
    const reader = child.stdout.getReader();
    let pending = "";

    while (true) {
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
          const deltaText = this.extractDeltaText(message);
          if (deltaText) {
            yield { type: "token", text: deltaText };
          }

          if (message.method === "turn/completed" || message.type === "done") {
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
      if (params.item && typeof params.item === "object") {
        const item = params.item as Record<string, unknown>;
        if (typeof item.text === "string") {
          return item.text;
        }
      }
    }

    return undefined;
  }
}
