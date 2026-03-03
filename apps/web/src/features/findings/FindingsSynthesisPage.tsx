import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type FindingDraftSuggestion, api } from "../../lib/api";

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

  const [draftSuggestions, setDraftSuggestions] = useState<FindingDraftSuggestion[]>([]);
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);
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

  const draftFindingsMutation = useMutation({
    mutationFn: () => api.draftFindings(projectId, { maxItems: 5 }),
    onSuccess: (result) => {
      setDraftSuggestions(result.suggestions);
    },
  });

  const createFindingMutation = useMutation({
    mutationFn: (finding: FindingDraftSuggestion) =>
      api.createFinding(projectId, {
        statement: finding.statement,
        status: finding.status,
        isHypothesis: finding.isHypothesis,
        citations: finding.citations,
        tags: finding.tags,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["findings", projectId] });
    },
  });

  const draftSynthesisMutation = useMutation({
    mutationFn: () => api.draftSynthesis(projectId, { selectedFindingIds }),
    onSuccess: (result) => {
      setDraft(result.content);
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

  const findings = findingsQuery.data?.findings ?? [];
  const selectedCount = selectedFindingIds.length;
  const draftPreview = draft || synthesisQuery.data?.content || "Loading synthesis...";

  const selectedLookup = useMemo(() => new Set(selectedFindingIds), [selectedFindingIds]);

  const toggleFinding = (findingId: string) => {
    setSelectedFindingIds((current) =>
      current.includes(findingId)
        ? current.filter((item) => item !== findingId)
        : [...current, findingId],
    );
  };

  const approveSuggestion = async (index: number, suggestion: FindingDraftSuggestion) => {
    await createFindingMutation.mutateAsync(suggestion);
    setDraftSuggestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const rejectSuggestion = (index: number) => {
    setDraftSuggestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="surface grid">
      <h2>Findings + Synthesis</h2>
      <p className="muted">
        AI generates draft findings and synthesis. Nothing durable is written until you approve or
        save.
      </p>

      <div className="card grid">
        <div className="split-row">
          <h3>AI Findings Drafts</h3>
          <button
            type="button"
            className="primary"
            onClick={() => draftFindingsMutation.mutate()}
            disabled={draftFindingsMutation.isPending}
          >
            {draftFindingsMutation.isPending ? "Generating..." : "Generate Findings (AI)"}
          </button>
        </div>
        {draftSuggestions.length === 0 ? (
          <p className="muted">No draft suggestions yet.</p>
        ) : (
          draftSuggestions.map((suggestion, index) => (
            <div className="card" key={`${suggestion.statement}-${index}`}>
              <p>{suggestion.statement}</p>
              <p className="muted">
                Status: {suggestion.status} ·{" "}
                {suggestion.isHypothesis ? "Hypothesis" : "Evidence-backed"} · Citations:{" "}
                {suggestion.citations.length}
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  onClick={() => approveSuggestion(index, suggestion)}
                  disabled={createFindingMutation.isPending}
                >
                  Approve
                </button>
                <button type="button" onClick={() => rejectSuggestion(index)}>
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card grid">
        <div className="split-row">
          <h3>Current Findings ({findings.length})</h3>
          <button
            type="button"
            onClick={() => draftSynthesisMutation.mutate()}
            disabled={selectedCount === 0 || draftSynthesisMutation.isPending}
          >
            {draftSynthesisMutation.isPending ? "Drafting..." : "Generate Synthesis Draft (AI)"}
          </button>
        </div>
        {findings.map((finding) => (
          <label className="finding-row" key={finding.findingId}>
            <input
              type="checkbox"
              checked={selectedLookup.has(finding.findingId)}
              onChange={() => toggleFinding(finding.findingId)}
            />
            <span>
              {finding.statement} <small className="muted">({finding.status})</small>
            </span>
          </label>
        ))}
      </div>

      <div className="card grid">
        <h3>Synthesis Draft</h3>
        <textarea
          rows={8}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Generate or write updated synthesis"
        />
        <div className="button-row">
          <button
            type="button"
            className="primary"
            onClick={() => updateSynthesisMutation.mutate()}
          >
            Save Synthesis
          </button>
        </div>
        <article className="markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftPreview}</ReactMarkdown>
        </article>
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
    </div>
  );
};
