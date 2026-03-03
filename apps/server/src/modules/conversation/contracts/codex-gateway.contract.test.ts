import { describe, expect, test } from "bun:test";
import { AppServerCodexGateway } from "../infrastructure/app-server-codex-gateway";
import { FakeCodexGateway } from "../infrastructure/fake-codex-gateway";

describe("CodexGateway contracts", () => {
  test("fake gateway yields token stream then done", async () => {
    const gateway = new FakeCodexGateway();
    const events = [] as string[];

    for await (const event of gateway.streamTurn({
      projectId: "project_1",
      threadId: "thread_1",
      packet: {
        systemRules: ["cite evidence"],
        projectCharter: "charter",
        currentQuestion: "question",
        threadSummary: "summary",
        retrievedEvidence: [],
        allowedTools: [],
        outputContract: {
          mustCite: true,
          allowHypothesis: true,
        },
      },
    })) {
      events.push(event.type);
    }

    expect(events.includes("token")).toBe(true);
    expect(events.at(-1)).toBe("done");
  });

  test("live app-server contract can be enabled explicitly", async () => {
    if (process.env.HELIX_CONTRACT_LIVE_CODEX !== "1") {
      return;
    }

    const gateway = new AppServerCodexGateway();
    let sawDone = false;

    for await (const event of gateway.streamTurn({
      projectId: "project_live",
      threadId: "thread_live",
      packet: {
        systemRules: ["be concise"],
        projectCharter: "Test charter",
        currentQuestion: "Say hi",
        threadSummary: "",
        retrievedEvidence: [],
        allowedTools: [],
        outputContract: {
          mustCite: false,
          allowHypothesis: true,
        },
      },
    })) {
      if (event.type === "done") {
        sawDone = true;
      }
    }

    expect(sawDone).toBe(true);
  });
});
