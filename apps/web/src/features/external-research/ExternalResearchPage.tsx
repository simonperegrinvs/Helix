import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type ExternalQueryDraft, api } from "../../lib/api";

export const ExternalResearchPage = ({ projectId }: { projectId: string }) => {
  const [goal, setGoal] = useState("Identify contradictory evidence and missing references");
  const [selectedDraft, setSelectedDraft] = useState<ExternalQueryDraft | null>(null);
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
    mutationFn: (queryDraftId: string) => api.triggerExternalQuery(projectId, queryDraftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-drafts", projectId] });
    },
  });

  return (
    <div className="surface grid">
      <h2>External Research Loop</h2>
      <p className="muted">
        Query package is AI-generated, read-only for review, and triggered manually.
      </p>

      <div className="card grid">
        <textarea value={goal} rows={5} onChange={(event) => setGoal(event.target.value)} />
        <button
          type="button"
          className="primary"
          onClick={() => draftMutation.mutate()}
          disabled={draftMutation.isPending}
        >
          {draftMutation.isPending ? "Drafting..." : "Draft Query Package"}
        </button>
      </div>

      <div className="grid">
        {(draftsQuery.data?.drafts ?? []).map((draft) => (
          <div className="card" key={draft.queryDraftId}>
            <h3>{draft.goal}</h3>
            <p>Status: {draft.status}</p>
            <p className="muted">ID: {draft.queryDraftId}</p>
            <div className="button-row">
              <button type="button" onClick={() => setSelectedDraft(draft)}>
                View Package
              </button>
              <button type="button" onClick={() => triggerMutation.mutate(draft.queryDraftId)}>
                Trigger (Manual)
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedDraft ? (
        <dialog className="modal-backdrop" open>
          <div className="modal-panel">
            <div className="modal-header">
              <h3>Query Package</h3>
              <button type="button" onClick={() => setSelectedDraft(null)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <p className="muted">{selectedDraft.goal}</p>
              <pre>{selectedDraft.queryText}</pre>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
};
