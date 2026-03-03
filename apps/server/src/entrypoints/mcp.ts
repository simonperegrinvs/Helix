import * as readline from "node:readline";
import { AppContainer } from "../shared/infrastructure/app-container";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const container = new AppContainer();

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

const write = (payload: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

rl.on("line", async (line) => {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    write({
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: "Parse error",
      },
    });
    return;
  }

  try {
    if (request.method === "initialize") {
      write({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2026-03-01",
          serverInfo: {
            name: "helix-mcp",
            version: "0.1.0",
          },
          capabilities: {
            tools: true,
          },
        },
      });
      return;
    }

    if (request.method === "tools/list") {
      write({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: container.mcpInterfaceApi.listTools(),
        },
      });
      return;
    }

    if (request.method === "tools/call") {
      const name = String(request.params?.name ?? "");
      const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await container.mcpInterfaceApi.handleToolCall({
        name,
        args,
        actor: "mcp-client",
      });

      write({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: "json",
              json: result,
            },
          ],
        },
      });
      return;
    }

    write({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${request.method}`,
      },
    });
  } catch (error) {
    write({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
});
