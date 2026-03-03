import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, streamChat } from "../../lib/api";

interface StreamEvent {
  event: string;
  data: unknown;
}

export const ProjectChatPage = ({ projectId }: { projectId: string }) => {
  const [question, setQuestion] = useState("");
  const [stream, setStream] = useState<string>("");
  const [citations, setCitations] = useState<Array<{ filePath: string; heading: string }>>([]);

  const askMutation = useMutation({
    mutationFn: async () => {
      setStream("");
      await streamChat(projectId, { question }, (event: StreamEvent) => {
        if (event.event === "metadata") {
          const payload = event.data as {
            citations?: Array<{ filePath: string; heading: string }>;
          };
          setCitations(payload.citations ?? []);
          return;
        }

        if (event.event === "token") {
          const payload = event.data as { text?: string };
          if (payload.text) {
            setStream((previous) => `${previous}${payload.text}`);
          }
        }
      });
    },
  });

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
        disabled={!question || askMutation.isPending}
        onClick={() => askMutation.mutate()}
      >
        {askMutation.isPending ? "Streaming..." : "Ask"}
      </button>

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
