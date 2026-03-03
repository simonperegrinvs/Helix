import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";

export const ProjectSettingsPage = ({ projectId }: { projectId: string }) => {
  const [vaultPath, setVaultPath] = useState("");
  const queryClient = useQueryClient();

  const attachMutation = useMutation({
    mutationFn: (path: string) => api.attachVault(projectId, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overview", projectId] });
      setVaultPath("");
    },
  });

  return (
    <div className="surface grid">
      <h2>Project Settings</h2>
      <div className="card grid">
        <label htmlFor="vaultPath">Attach Vault Folder</label>
        <input
          id="vaultPath"
          value={vaultPath}
          onChange={(event) => setVaultPath(event.target.value)}
          placeholder="/absolute/path/to/project-vault"
        />
        <button
          type="button"
          className="primary"
          disabled={!vaultPath || attachMutation.isPending}
          onClick={() => attachMutation.mutate(vaultPath)}
        >
          {attachMutation.isPending ? "Attaching..." : "Attach Vault Folder"}
        </button>
      </div>
    </div>
  );
};
