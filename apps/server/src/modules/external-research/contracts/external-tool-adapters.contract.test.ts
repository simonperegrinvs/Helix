import { afterAll, describe, expect, test } from "bun:test";
import { HttpExternalResearchToolAdapter } from "../infrastructure/http-external-research-tool-adapter";
import { ManualExternalResearchToolAdapter } from "../infrastructure/manual-external-research-tool-adapter";

describe("ExternalResearchToolPort contracts", () => {
  const servers: Array<{ stop: () => void }> = [];

  afterAll(() => {
    for (const server of servers) {
      server.stop();
    }
  });

  test("manual adapter returns accepted payload package", async () => {
    const adapter = new ManualExternalResearchToolAdapter();
    const result = await adapter.trigger({
      projectId: "project_1",
      queryDraftId: "query_1",
      queryPackage: { goal: "x" },
    });

    expect(result.accepted).toBe(true);
    expect(result.mode).toBe("manual");
    expect(result.payload.queryPackage).toBeDefined();
  });

  test("http adapter posts trigger payload and returns run result", async () => {
    const received: Array<Record<string, unknown>> = [];

    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        if (new URL(request.url).pathname !== "/trigger") {
          return new Response("not found", { status: 404 });
        }

        const body = (await request.json()) as Record<string, unknown>;
        received.push(body);

        return Response.json({
          runId: "run_http_1",
          accepted: true,
          echoed: body,
        });
      },
    });
    servers.push(server);

    const adapter = new HttpExternalResearchToolAdapter({
      baseUrl: `http://${server.hostname}:${server.port}`,
      timeoutMs: 2_000,
    });

    const result = await adapter.trigger({
      projectId: "project_2",
      queryDraftId: "query_2",
      queryPackage: { goal: "http contract" },
    });

    expect(result.mode).toBe("http");
    expect(result.runId).toBe("run_http_1");
    expect(result.accepted).toBe(true);
    expect(received[0]?.projectId).toBe("project_2");
  });

  test("live external tool contract can be enabled explicitly", async () => {
    if (process.env.HELIX_CONTRACT_LIVE_EXTERNAL !== "1") {
      return;
    }

    const baseUrl = process.env.HELIX_CONTRACT_LIVE_EXTERNAL_URL;
    if (!baseUrl) {
      throw new Error("HELIX_CONTRACT_LIVE_EXTERNAL_URL is required for live external contract");
    }

    const adapter = new HttpExternalResearchToolAdapter({
      baseUrl,
      token: process.env.HELIX_CONTRACT_LIVE_EXTERNAL_TOKEN,
      timeoutMs: 20_000,
    });

    const result = await adapter.trigger({
      projectId: "contract_project_live",
      queryDraftId: "contract_query_live",
      queryPackage: {
        goal: "Live external connector contract",
        outputShape: { sections: ["references"] },
      },
    });

    expect(result.accepted).toBe(true);
    expect(result.runId.length).toBeGreaterThan(0);
  });
});
