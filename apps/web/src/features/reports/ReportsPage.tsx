import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";

export const ReportsPage = ({ projectId }: { projectId: string }) => {
  const [filename, setFilename] = useState("deep-research-report.md");
  const [content, setContent] = useState(
    "# Imported report\n\nPaste externally-generated research here.",
  );
  const queryClient = useQueryClient();

  const reportsQuery = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api.listReports(projectId),
  });

  const importMutation = useMutation({
    mutationFn: () =>
      api.importReport(projectId, {
        sourceType: "manual",
        originalFilename: filename,
        content,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
    },
  });

  return (
    <div className="surface grid">
      <h2>Imported Reports</h2>
      <div className="card grid">
        <input value={filename} onChange={(event) => setFilename(event.target.value)} />
        <textarea rows={10} value={content} onChange={(event) => setContent(event.target.value)} />
        <button
          type="button"
          className="primary"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
        >
          {importMutation.isPending ? "Importing..." : "Import Report"}
        </button>
      </div>

      <div className="grid">
        {(reportsQuery.data?.reports ?? []).map((report) => (
          <pre key={String((report as { reportId?: string }).reportId ?? JSON.stringify(report))}>
            {JSON.stringify(report, null, 2)}
          </pre>
        ))}
      </div>
    </div>
  );
};
