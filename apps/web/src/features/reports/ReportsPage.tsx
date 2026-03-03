import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../lib/api";

const EXTRACTION_LABELS: Record<string, string> = {
  markdown_passthrough: "Markdown",
  plaintext_to_markdown: "Text converted to Markdown",
  pdftotext: "PDF text extraction",
  pdf_fallback_placeholder: "PDF imported (preview limited)",
  binary_fallback: "Generic file import",
};

const titleize = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const formatSourceType = (sourceType: string): string => titleize(sourceType);

const formatExtractionLabel = (extraction: unknown): string => {
  const key = String(extraction ?? "").trim();
  if (!key) {
    return "Unknown";
  }
  return EXTRACTION_LABELS[key] ?? titleize(key);
};

const formatImportedAt = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

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
              <span className="status-badge">{formatSourceType(report.sourceType)}</span>
            </div>
            <p className="muted">
              Source: {formatSourceType(report.sourceType)} · Imported{" "}
              {formatImportedAt(report.importedAt)}
            </p>
            <p className="muted">Format: {formatExtractionLabel(report.metadata.extraction)}</p>
            <details className="technical-details">
              <summary>Technical details</summary>
              <p className="muted">
                Stored at <code>{report.normalizedPath}</code>
              </p>
              <p className="muted">
                Report ID: <code>{report.reportId}</code>
              </p>
            </details>
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
                <>
                  <p className="muted">
                    Source: {formatSourceType(selectedReportQuery.data.report.sourceType)} ·
                    Imported {formatImportedAt(selectedReportQuery.data.report.importedAt)} ·
                    Format:{" "}
                    {formatExtractionLabel(selectedReportQuery.data.report.metadata.extraction)}
                  </p>
                  {showRaw ? (
                    <pre>{selectedReportQuery.data.normalizedContent}</pre>
                  ) : (
                    <article className="markdown-preview">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedReportQuery.data.normalizedContent}
                      </ReactMarkdown>
                    </article>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
};
