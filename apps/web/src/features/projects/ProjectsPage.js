import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
export const ProjectsPage = () => {
    const [name, setName] = useState("");
    const [vaultRoot, setVaultRoot] = useState("");
    const queryClient = useQueryClient();
    const projectsQuery = useQuery({
        queryKey: ["projects"],
        queryFn: api.listProjects,
    });
    const createMutation = useMutation({
        mutationFn: api.createProject,
        onSuccess: () => {
            setName("");
            queryClient.invalidateQueries({ queryKey: ["projects"] });
        },
    });
    return (_jsxs("div", { className: "surface grid", children: [_jsx("h2", { children: "Research Projects" }), _jsxs("div", { className: "card grid", children: [_jsx("h3", { children: "Create Project" }), _jsx("input", { value: name, onChange: (event) => setName(event.target.value), placeholder: "Project name" }), _jsx("input", { value: vaultRoot, onChange: (event) => setVaultRoot(event.target.value), placeholder: "Optional vault root path" }), _jsx("button", { type: "button", className: "primary", onClick: () => createMutation.mutate({ name, vaultRoot: vaultRoot || undefined }), disabled: !name || createMutation.isPending, children: createMutation.isPending ? "Creating..." : "Create" })] }), _jsx("div", { className: "grid two", children: (projectsQuery.data?.projects ?? []).map((project) => (_jsxs("div", { className: "card", children: [_jsx("h3", { children: project.name }), _jsx("p", { className: "muted", children: project.vaultPath }), _jsx(Link, { className: "ghost-button", to: `/projects/${project.projectId}`, children: "Open Workspace" })] }, project.projectId))) })] }));
};
