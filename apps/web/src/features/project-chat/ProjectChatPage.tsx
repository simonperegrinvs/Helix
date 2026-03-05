import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AiProgressPanel } from "../ai-progress/AiProgressPanel";
import { useAiRun } from "../ai-progress/useAiRun";
import { api, type ChatTurnResult, streamChat } from "../../lib/api";

export const ProjectChatPage = ({ projectId }: { projectId: string }) => {
  const [question, setQuestion] = useState("");
  const [stream, setStream] = useState<string>("");
  const [citations, setCitations] = useState<Array<{ filePath: string; heading: string }>>([]);
  const chatRun = useAiRun<ChatTurnResult>();

  const ask = async () => {
    setStream("");
    setCitations([]);

    const result = await chatRun.start((onEvent, signal) =>
      streamChat(
        projectId,
        { question },
        (event) => {
          onEvent(event);

          if (event.type === "artifact" && event.name === "metadata") {
            const payload = event.data as {
              citations?: Array<{ filePath: string; heading: string }>;
            };
            setCitations(payload.citations ?? []);
            return;
          }

          if (event.type === "token") {
            setStream((previous) => `${previous}${event.text}`);
          }
        },
        signal,
      ),
    );

    if (result) {
      setCitations(result.citations ?? []);
    }
  };

  const searchQuery = useQuery({
    queryKey: ["search-preview", projectId, question],
    queryFn: () => api.search(projectId, question),
    enabled: question.length > 8,
  });

  const citationLabel = useMemo(() => {
    if (citations.length === 0) {
      return "No citations yet";
    }
    return `${citations.length} citation(s) linked`;
  }, [citations.length]);

  return (
    <div className="surface grid">
      <h2>Grounded Chat</h2>
      <p className="muted">{citationLabel}</p>
      <textarea
        rows={4}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Ask a question grounded in this project..."
      />
      <button
        type="button"
        className="primary"
        disabled={!question || chatRun.run.status === "running"}
        onClick={ask}
      >
        {chatRun.run.status === "running" ? "Streaming..." : "Ask"}
      </button>

      <AiProgressPanel
        title="Chat Progress"
        run={chatRun.run}
        elapsedMs={chatRun.elapsedMs}
        silenceMs={chatRun.silenceMs}
        onCancel={chatRun.cancel}
      />

      <div className="chat-stream">{stream || "No streamed response yet."}</div>

      <div className="card grid">
        <h3>Evidence Preview</h3>
        {(searchQuery.data?.items ?? []).map((item) => (
          <div key={item.chunkId}>
            <strong>
              {item.filePath} · {item.heading}
            </strong>
            <p className="muted">{item.excerpt.slice(0, 180)}...</p>
          </div>
        ))}
      </div>
    </div>
  );
};
