import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  type ExternalQueryDraft,
  type ExternalQueryDraftResult,
  api,
  streamExternalQueryDraft,
} from "../../lib/api";
import { AiProgressPanel } from "../ai-progress/AiProgressPanel";
import { useAiRun } from "../ai-progress/useAiRun";

export const ExternalResearchPage = ({ projectId }: { projectId: string }) => {
  const [goal, setGoal] = useState("Identify contradictory evidence and missing references");
  const [selectedDraft, setSelectedDraft] = useState<ExternalQueryDraft | null>(null);
  const queryClient = useQueryClient();
  const draftRun = useAiRun<ExternalQueryDraftResult>();

  const draftsQuery = useQuery({
    queryKey: ["external-drafts", projectId],
    queryFn: () => api.listExternalDrafts(projectId),
  });

  const triggerMutation = useMutation({
    mutationFn: (queryDraftId: string) => api.triggerExternalQuery(projectId, queryDraftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-drafts", projectId] });
    },
  });

  const draftQueryPackage = async () => {
    const result = await draftRun.start((onEvent, signal) =>
      streamExternalQueryDraft(projectId, { goal }, onEvent, signal),
    );

    if (result?.draft) {
      queryClient.invalidateQueries({ queryKey: ["external-drafts", projectId] });
      setSelectedDraft(result.draft);
    }
  };

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
          onClick={draftQueryPackage}
          disabled={draftRun.run.status === "running"}
        >
          {draftRun.run.status === "running" ? "Drafting..." : "Draft Query Package"}
        </button>

        <AiProgressPanel
          title="External Query Draft"
          run={draftRun.run}
          elapsedMs={draftRun.elapsedMs}
          silenceMs={draftRun.silenceMs}
          onCancel={draftRun.cancel}
        />
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
