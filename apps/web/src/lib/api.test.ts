import { afterEach, describe, expect, test, vi } from "vitest";
import { streamChat, streamFindingsDraft } from "./api";

const encoder = new TextEncoder();

const sseResponse = (chunks: string[]): Response => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stream api", () => {
  test("parses chunked SSE and returns done result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: stage\ndata: {"type":"stage","action":"chat_turn","stage":"prepare","message":"Preparing","percent":5,"at":"2026-03-03T12:00:00.000Z"}\n\n',
          'event: token\ndata: {"type":"token","action":"chat_turn","text":"Hello"}\n\n',
          'event: done\ndata: {"type":"done","action":"chat_turn","durationMs":10,"result":',
          '{"response":"Hello","turnId":"turn_1","threadId":"thread_1","citations":[]}}\n\n',
        ]),
      ),
    );

    const seen: string[] = [];
    const result = await streamChat(
      "project_1",
      { question: "What evidence?" },
      (event) => seen.push(event.type),
    );

    expect(result.response).toBe("Hello");
    expect(result.turnId).toBe("turn_1");
    expect(seen).toEqual(["stage", "token", "done"]);
  });

  test("throws when stream emits error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: stage\ndata: {"type":"stage","action":"findings_draft","stage":"prepare","message":"Preparing","percent":5,"at":"2026-03-03T12:00:00.000Z"}\n\n',
          'event: error\ndata: {"type":"error","action":"findings_draft","error":"boom"}\n\n',
        ]),
      ),
    );

    await expect(
      streamFindingsDraft("project_1", { maxItems: 3 }, () => {
        // no-op
      }),
    ).rejects.toThrow("boom");
  });

  test("throws when stream ends without done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: stage\ndata: {"type":"stage","action":"findings_draft","stage":"prepare","message":"Preparing","percent":5,"at":"2026-03-03T12:00:00.000Z"}\n\n',
        ]),
      ),
    );

    await expect(
      streamFindingsDraft("project_1", { maxItems: 3 }, () => {
        // no-op
      }),
    ).rejects.toThrow("Stream ended before completion");
  });
});
