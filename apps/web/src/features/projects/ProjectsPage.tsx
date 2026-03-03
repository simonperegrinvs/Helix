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

  return (
    <div className="surface grid">
      <h2>Research Projects</h2>
      <div className="card grid">
        <h3>Create Project</h3>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
        />
        <input
          value={vaultRoot}
          onChange={(event) => setVaultRoot(event.target.value)}
          placeholder="Optional vault root path"
        />
        <button
          type="button"
          className="primary"
          onClick={() => createMutation.mutate({ name, vaultRoot: vaultRoot || undefined })}
          disabled={!name || createMutation.isPending}
        >
          {createMutation.isPending ? "Creating..." : "Create"}
        </button>
      </div>

      <div className="grid two">
        {(projectsQuery.data?.projects ?? []).map((project) => (
          <div className="card" key={project.projectId}>
            <h3>{project.name}</h3>
            <p className="muted">{project.vaultPath}</p>
            <Link className="ghost-button" to={`/projects/${project.projectId}`}>
              Open Workspace
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
};
