import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
export const ExternalResearchPage = ({ projectId }) => {
    const [goal, setGoal] = useState("Identify contradictory evidence and missing references");
    const queryClient = useQueryClient();
    const draftsQuery = useQuery({
        queryKey: ["external-drafts", projectId],
        queryFn: () => api.listExternalDrafts(projectId),
    });
    const draftMutation = useMutation({
        mutationFn: () => api.draftExternalQuery(projectId, { goal }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["external-drafts", projectId] });
        },
    });
    const triggerMutation = useMutation({
        mutationFn: (queryDraftId) => api.triggerExternalQuery(projectId, queryDraftId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["external-drafts", projectId] });
        },
    });
    return (_jsxs("div", { className: "surface grid", children: [_jsx("h2", { children: "External Research Loop" }), _jsxs("div", { className: "card grid", children: [_jsx("textarea", { value: goal, rows: 5, onChange: (event) => setGoal(event.target.value) }), _jsx("button", { type: "button", className: "primary", onClick: () => draftMutation.mutate(), children: "Draft Query Package" })] }), _jsx("div", { className: "grid", children: (draftsQuery.data?.drafts ?? []).map((draft) => (_jsxs("div", { className: "card", children: [_jsx("h3", { children: draft.goal }), _jsxs("p", { children: ["Status: ", draft.status] }), _jsxs("p", { children: ["ID: ", draft.queryDraftId] }), _jsx("button", { type: "button", onClick: () => triggerMutation.mutate(draft.queryDraftId), children: "Trigger (Manual)" })] }, draft.queryDraftId))) })] }));
};
