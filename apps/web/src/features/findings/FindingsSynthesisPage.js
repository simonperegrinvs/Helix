import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
export const FindingsSynthesisPage = ({ projectId }) => {
    const queryClient = useQueryClient();
    const synthesisQuery = useQuery({
        queryKey: ["synthesis", projectId],
        queryFn: () => api.getSynthesis(projectId),
    });
    const findingsQuery = useQuery({
        queryKey: ["findings", projectId],
        queryFn: () => api.listFindings(projectId),
    });
    const [draft, setDraft] = useState("");
    const [patch, setPatch] = useState("");
    const [proposalId, setProposalId] = useState("");
    const [approvalToken, setApprovalToken] = useState("");
    const updateSynthesisMutation = useMutation({
        mutationFn: () => api.updateSynthesis(projectId, { content: draft, confidence: 0.7 }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["synthesis", projectId] });
        },
    });
    const proposePatchMutation = useMutation({
        mutationFn: () => api.proposePatch(projectId, "04-synthesis/current-synthesis.md", patch),
        onSuccess: (result) => {
            setProposalId(result.proposal.proposalId);
            setApprovalToken(result.approvalToken);
        },
    });
    const applyPatchMutation = useMutation({
        mutationFn: () => api.applyPatch(projectId, proposalId, approvalToken),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["synthesis", projectId] });
        },
    });
    return (_jsxs("div", { className: "surface grid", children: [_jsx("h2", { children: "Findings + Synthesis" }), _jsxs("div", { className: "card grid", children: [_jsx("h3", { children: "Current Synthesis" }), _jsx("pre", { children: synthesisQuery.data?.content ?? "Loading synthesis..." }), _jsx("textarea", { rows: 7, value: draft, onChange: (event) => setDraft(event.target.value), placeholder: "Write updated synthesis" }), _jsx("button", { type: "button", className: "primary", onClick: () => updateSynthesisMutation.mutate(), children: "Save Synthesis" })] }), _jsxs("div", { className: "card grid", children: [_jsx("h3", { children: "Patch Propose / Apply" }), _jsx("textarea", { rows: 7, value: patch, onChange: (event) => setPatch(event.target.value), placeholder: "Proposed synthesis content" }), _jsx("button", { type: "button", onClick: () => proposePatchMutation.mutate(), children: "Propose Patch" }), proposalId ? _jsxs("p", { children: ["Proposal: ", proposalId] }) : null, approvalToken ? _jsxs("p", { children: ["Approval token: ", approvalToken] }) : null, _jsx("button", { type: "button", className: "primary", disabled: !proposalId || !approvalToken, onClick: () => applyPatchMutation.mutate(), children: "Apply Patch" })] }), _jsxs("div", { className: "card grid", children: [_jsx("h3", { children: "Findings" }), (findingsQuery.data?.findings ?? []).map((finding) => (_jsx("pre", { children: JSON.stringify(finding, null, 2) }, String(finding.findingId ?? JSON.stringify(finding)))))] })] }));
};
