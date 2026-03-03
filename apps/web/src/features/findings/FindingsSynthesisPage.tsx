import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";

export const FindingsSynthesisPage = ({ projectId }: { projectId: string }) => {
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

  return (
    <div className="surface grid">
      <h2>Findings + Synthesis</h2>

      <div className="card grid">
        <h3>Current Synthesis</h3>
        <pre>{synthesisQuery.data?.content ?? "Loading synthesis..."}</pre>
        <textarea
          rows={7}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write updated synthesis"
        />
        <button type="button" className="primary" onClick={() => updateSynthesisMutation.mutate()}>
          Save Synthesis
        </button>
      </div>

      <div className="card grid">
        <h3>Patch Propose / Apply</h3>
        <textarea
          rows={7}
          value={patch}
          onChange={(event) => setPatch(event.target.value)}
          placeholder="Proposed synthesis content"
        />
        <button type="button" onClick={() => proposePatchMutation.mutate()}>
          Propose Patch
        </button>
        {proposalId ? <p>Proposal: {proposalId}</p> : null}
        {approvalToken ? <p>Approval token: {approvalToken}</p> : null}
        <button
          type="button"
          className="primary"
          disabled={!proposalId || !approvalToken}
          onClick={() => applyPatchMutation.mutate()}
        >
          Apply Patch
        </button>
      </div>

      <div className="card grid">
        <h3>Findings</h3>
        {(findingsQuery.data?.findings ?? []).map((finding) => (
          <pre
            key={String((finding as { findingId?: string }).findingId ?? JSON.stringify(finding))}
          >
            {JSON.stringify(finding, null, 2)}
          </pre>
        ))}
      </div>
    </div>
  );
};
