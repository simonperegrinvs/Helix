import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, streamChat } from "../../lib/api";
export const ProjectChatPage = ({ projectId }) => {
    const [question, setQuestion] = useState("");
    const [stream, setStream] = useState("");
    const [citations, setCitations] = useState([]);
    const askMutation = useMutation({
        mutationFn: async () => {
            setStream("");
            await streamChat(projectId, { question }, (event) => {
                if (event.event === "metadata") {
                    const payload = event.data;
                    setCitations(payload.citations ?? []);
                    return;
                }
                if (event.event === "token") {
                    const payload = event.data;
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
    return (_jsxs("div", { className: "surface grid", children: [_jsx("h2", { children: "Grounded Chat" }), _jsx("p", { className: "muted", children: citationLabel }), _jsx("textarea", { rows: 4, value: question, onChange: (event) => setQuestion(event.target.value), placeholder: "Ask a question grounded in this project..." }), _jsx("button", { type: "button", className: "primary", disabled: !question || askMutation.isPending, onClick: () => askMutation.mutate(), children: askMutation.isPending ? "Streaming..." : "Ask" }), _jsx("div", { className: "chat-stream", children: stream || "No streamed response yet." }), _jsxs("div", { className: "card grid", children: [_jsx("h3", { children: "Evidence Preview" }), (searchQuery.data?.items ?? []).map((item) => (_jsxs("div", { children: [_jsxs("strong", { children: [item.filePath, " \u00B7 ", item.heading] }), _jsxs("p", { className: "muted", children: [item.excerpt.slice(0, 180), "..."] })] }, item.chunkId)))] })] }));
};
