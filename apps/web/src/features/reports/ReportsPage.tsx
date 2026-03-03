import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../lib/api";

export const ReportsPage = ({ projectId }: { projectId: string }) => {
  const [filename, setFilename] = useState("deep-research-report.md");
  const [content, setContent] = useState(
    "# Imported report\n\nPaste externally-generated research here.",
  );
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const queryClient = useQueryClient();

  const reportsQuery = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api.listReports(projectId),
  });

  const selectedReportQuery = useQuery({
    queryKey: ["report-content", projectId, selectedReportId],
    queryFn: () => api.getReportContent(projectId, selectedReportId ?? ""),
    enabled: Boolean(selectedReportId),
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
          <div className="card report-card" key={report.reportId}>
            <div className="report-header">
              <h3>{report.originalFilename}</h3>
              <span className="status-badge">{report.sourceType}</span>
            </div>
            <p className="muted">
              Imported: {new Date(report.importedAt).toLocaleString()} · Extraction:{" "}
              {String(report.metadata.extraction ?? "unknown")}
            </p>
            <p className="muted">{report.normalizedPath}</p>
            <div className="button-row">
              <button type="button" onClick={() => setSelectedReportId(report.reportId)}>
                View
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedReportId ? (
        <dialog className="modal-backdrop" open>
          <div className="modal-panel">
            <div className="modal-header">
              <h3>{selectedReportQuery.data?.report.originalFilename ?? "Report"}</h3>
              <div className="button-row">
                <button type="button" onClick={() => setShowRaw((value) => !value)}>
                  {showRaw ? "Markdown Preview" : "Raw"}
                </button>
                <button type="button" onClick={() => setSelectedReportId(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="modal-body">
              {selectedReportQuery.isLoading ? <p>Loading report...</p> : null}
              {selectedReportQuery.isError ? (
                <p className="muted">Unable to load report content.</p>
              ) : null}
              {selectedReportQuery.data ? (
                showRaw ? (
                  <pre>{selectedReportQuery.data.normalizedContent}</pre>
                ) : (
                  <article className="markdown-preview">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedReportQuery.data.normalizedContent}
                    </ReactMarkdown>
                  </article>
                )
              ) : null}
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
};
