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
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Helix</h1>
          <p>Vault-first research platform</p>
        </div>
        <Link className="ghost-button" to="/projects">
          Projects
        </Link>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId/*" element={<ProjectWorkspace />} />
        </Routes>
      </main>
    </div>
  );
};

const ProjectWorkspace = () => {
  const { projectId = "" } = useParams();
  const location = useLocation();

  const nav = useMemo(
    () => [
      { to: "", label: "Overview" },
      { to: "chat", label: "Chat" },
      { to: "reports", label: "Reports" },
      { to: "findings", label: "Findings + Synthesis" },
      { to: "external", label: "External Query" },
      { to: "audit", label: "Audit" },
      { to: "settings", label: "Settings" },
    ],
    [],
  );

  return (
    <div className="workspace">
      <aside className="workspace-nav">
        <p className="workspace-title">Active Project</p>
        <code>{projectId}</code>
        {nav.map((item) => {
          const absolute = `/projects/${projectId}/${item.to}`;
          const active =
            location.pathname === absolute ||
            (item.to === "" && location.pathname.endsWith(projectId));
          return (
            <Link
              key={item.label}
              to={absolute}
              className={active ? "nav-link active" : "nav-link"}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>

      <section className="workspace-content">
        <Routes>
          <Route path="" element={<ProjectOverviewPage projectId={projectId} />} />
          <Route path="chat" element={<ProjectChatPage projectId={projectId} />} />
          <Route path="reports" element={<ReportsPage projectId={projectId} />} />
          <Route path="findings" element={<FindingsSynthesisPage projectId={projectId} />} />
          <Route path="external" element={<ExternalResearchPage projectId={projectId} />} />
          <Route path="audit" element={<AuditPage projectId={projectId} />} />
          <Route path="settings" element={<ProjectSettingsPage projectId={projectId} />} />
        </Routes>
      </section>
    </div>
  );
};
