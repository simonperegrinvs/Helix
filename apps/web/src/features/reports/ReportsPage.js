import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
export const ReportsPage = ({ projectId }) => {
    const [filename, setFilename] = useState("deep-research-report.md");
    const [content, setContent] = useState("# Imported report\n\nPaste externally-generated research here.");
    const queryClient = useQueryClient();
    const reportsQuery = useQuery({
        queryKey: ["reports", projectId],
        queryFn: () => api.listReports(projectId),
    });
    const importMutation = useMutation({
        mutationFn: () => api.importReport(projectId, {
            sourceType: "manual",
            originalFilename: filename,
            content,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
        },
    });
    return (_jsxs("div", { className: "surface grid", children: [_jsx("h2", { children: "Imported Reports" }), _jsxs("div", { className: "card grid", children: [_jsx("input", { value: filename, onChange: (event) => setFilename(event.target.value) }), _jsx("textarea", { rows: 10, value: content, onChange: (event) => setContent(event.target.value) }), _jsx("button", { type: "button", className: "primary", onClick: () => importMutation.mutate(), disabled: importMutation.isPending, children: importMutation.isPending ? "Importing..." : "Import Report" })] }), _jsx("div", { className: "grid", children: (reportsQuery.data?.reports ?? []).map((report) => (_jsx("pre", { children: JSON.stringify(report, null, 2) }, String(report.reportId ?? JSON.stringify(report))))) })] }));
};
