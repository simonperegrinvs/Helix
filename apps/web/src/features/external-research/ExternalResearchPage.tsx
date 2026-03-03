import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";

export const ExternalResearchPage = ({ projectId }: { projectId: string }) => {
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
    mutationFn: (queryDraftId: string) => api.triggerExternalQuery(projectId, queryDraftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-drafts", projectId] });
    },
  });

  return (
    <div className="surface grid">
      <h2>External Research Loop</h2>
      <div className="card grid">
        <textarea value={goal} rows={5} onChange={(event) => setGoal(event.target.value)} />
        <button type="button" className="primary" onClick={() => draftMutation.mutate()}>
          Draft Query Package
        </button>
      </div>

      <div className="grid">
        {(draftsQuery.data?.drafts ?? []).map((draft) => (
          <div className="card" key={draft.queryDraftId}>
            <h3>{draft.goal}</h3>
            <p>Status: {draft.status}</p>
            <p>ID: {draft.queryDraftId}</p>
            <button type="button" onClick={() => triggerMutation.mutate(draft.queryDraftId)}>
              Trigger (Manual)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
