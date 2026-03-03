import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const ProjectOverviewPage = ({ projectId }: { projectId: string }) => {
  const overviewQuery = useQuery({
    queryKey: ["overview", projectId],
    queryFn: () => api.getOverview(projectId),
  });

  const data = overviewQuery.data as
    | {
        project: { name: string; vaultPath: string; slug: string; status: string };
        stats: Record<string, number>;
      }
    | undefined;

  return (
    <div className="surface grid">
      <h2>Project Overview</h2>
      {data ? (
        <>
          <div className="card">
            <h3>{data.project.name}</h3>
            <p>
              <strong>Slug:</strong> {data.project.slug}
            </p>
            <p>
              <strong>Vault:</strong> {data.project.vaultPath}
            </p>
            <p>
              <strong>Status:</strong> {data.project.status}
            </p>
          </div>
          <div className="grid two">
            {Object.entries(data.stats).map(([key, value]) => (
              <div className="card" key={key}>
                <h4>{key}</h4>
                <p>{value}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};
