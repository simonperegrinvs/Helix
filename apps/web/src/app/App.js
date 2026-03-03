import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuditPage } from "../features/audit/AuditPage";
import { ExternalResearchPage } from "../features/external-research/ExternalResearchPage";
import { FindingsSynthesisPage } from "../features/findings/FindingsSynthesisPage";
import { ProjectChatPage } from "../features/project-chat/ProjectChatPage";
import { ProjectOverviewPage } from "../features/projects/ProjectOverviewPage";
import { ProjectSettingsPage } from "../features/projects/ProjectSettingsPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ReportsPage } from "../features/reports/ReportsPage";
export const App = () => {
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { className: "topbar", children: [_jsxs("div", { children: [_jsx("h1", { children: "Helix" }), _jsx("p", { children: "Vault-first research platform" })] }), _jsx(Link, { className: "ghost-button", to: "/projects", children: "Projects" })] }), _jsx("main", { className: "main-content", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/projects", replace: true }) }), _jsx(Route, { path: "/projects", element: _jsx(ProjectsPage, {}) }), _jsx(Route, { path: "/projects/:projectId/*", element: _jsx(ProjectWorkspace, {}) })] }) })] }));
};
const ProjectWorkspace = () => {
    const { projectId = "" } = useParams();
    const location = useLocation();
    const nav = useMemo(() => [
        { to: "", label: "Overview" },
        { to: "chat", label: "Chat" },
        { to: "reports", label: "Reports" },
        { to: "findings", label: "Findings + Synthesis" },
        { to: "external", label: "External Query" },
        { to: "audit", label: "Audit" },
        { to: "settings", label: "Settings" },
    ], []);
    return (_jsxs("div", { className: "workspace", children: [_jsxs("aside", { className: "workspace-nav", children: [_jsx("p", { className: "workspace-title", children: "Active Project" }), _jsx("code", { children: projectId }), nav.map((item) => {
                        const absolute = `/projects/${projectId}/${item.to}`;
                        const active = location.pathname === absolute ||
                            (item.to === "" && location.pathname.endsWith(projectId));
                        return (_jsx(Link, { to: absolute, className: active ? "nav-link active" : "nav-link", children: item.label }, item.label));
                    })] }), _jsx("section", { className: "workspace-content", children: _jsxs(Routes, { children: [_jsx(Route, { path: "", element: _jsx(ProjectOverviewPage, { projectId: projectId }) }), _jsx(Route, { path: "chat", element: _jsx(ProjectChatPage, { projectId: projectId }) }), _jsx(Route, { path: "reports", element: _jsx(ReportsPage, { projectId: projectId }) }), _jsx(Route, { path: "findings", element: _jsx(FindingsSynthesisPage, { projectId: projectId }) }), _jsx(Route, { path: "external", element: _jsx(ExternalResearchPage, { projectId: projectId }) }), _jsx(Route, { path: "audit", element: _jsx(AuditPage, { projectId: projectId }) }), _jsx(Route, { path: "settings", element: _jsx(ProjectSettingsPage, { projectId: projectId }) })] }) })] }));
};
