import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
export const ProjectSettingsPage = ({ projectId }) => {
    const [vaultPath, setVaultPath] = useState("");
    const queryClient = useQueryClient();
    const attachMutation = useMutation({
        mutationFn: (path) => api.attachVault(projectId, path),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["overview", projectId] });
            setVaultPath("");
        },
    });
    return (_jsxs("div", { className: "surface grid", children: [_jsx("h2", { children: "Project Settings" }), _jsxs("div", { className: "card grid", children: [_jsx("label", { htmlFor: "vaultPath", children: "Attach Vault Folder" }), _jsx("input", { id: "vaultPath", value: vaultPath, onChange: (event) => setVaultPath(event.target.value), placeholder: "/absolute/path/to/project-vault" }), _jsx("button", { type: "button", className: "primary", disabled: !vaultPath || attachMutation.isPending, onClick: () => attachMutation.mutate(vaultPath), children: attachMutation.isPending ? "Attaching..." : "Attach Vault Folder" })] })] }));
};
