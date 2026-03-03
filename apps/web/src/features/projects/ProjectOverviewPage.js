import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
export const ProjectOverviewPage = ({ projectId }) => {
    const overviewQuery = useQuery({
        queryKey: ["overview", projectId],
        queryFn: () => api.getOverview(projectId),
    });
    const data = overviewQuery.data;
    return (_jsxs("div", { className: "surface grid", children: [_jsx("h2", { children: "Project Overview" }), data ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: data.project.name }), _jsxs("p", { children: [_jsx("strong", { children: "Slug:" }), " ", data.project.slug] }), _jsxs("p", { children: [_jsx("strong", { children: "Vault:" }), " ", data.project.vaultPath] }), _jsxs("p", { children: [_jsx("strong", { children: "Status:" }), " ", data.project.status] })] }), _jsx("div", { className: "grid two", children: Object.entries(data.stats).map(([key, value]) => (_jsxs("div", { className: "card", children: [_jsx("h4", { children: key }), _jsx("p", { children: value })] }, key))) })] })) : (_jsx("p", { children: "Loading..." }))] }));
};
