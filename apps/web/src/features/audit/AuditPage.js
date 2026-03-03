import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
export const AuditPage = ({ projectId }) => {
    const eventsQuery = useQuery({
        queryKey: ["audit", projectId],
        queryFn: () => api.auditEvents(projectId),
        refetchInterval: 5000,
    });
    return (_jsxs("div", { className: "surface grid", children: [_jsx("h2", { children: "Audit Trail" }), (eventsQuery.data?.events ?? []).map((event) => (_jsx("pre", { children: JSON.stringify(event, null, 2) }, String(event.id ?? JSON.stringify(event)))))] }));
};
