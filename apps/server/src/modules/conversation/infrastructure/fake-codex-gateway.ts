import type { CodexGateway, CodexStreamEvent, PromptPacket } from "../application/codex-gateway";

export class FakeCodexGateway implements CodexGateway {
  async *streamTurn(input: {
    projectId: string;
    threadId: string;
    packet: PromptPacket;
    signal?: AbortSignal;
  }): AsyncGenerator<CodexStreamEvent, void, void> {
    const response = [
      `Working in project ${input.projectId}.`,
      `Question: ${input.packet.currentQuestion}`,
      "This is a deterministic fake response for integration tests.",
    ].join(" ");

    for (const token of response.split(" ")) {
      if (input.signal?.aborted) {
        return;
      }
      yield {
        type: "token",
        text: `${token} `,
      };
    }

    yield {
      type: "done",
    };
  }
}
