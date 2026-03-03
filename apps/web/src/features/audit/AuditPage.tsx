import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const AuditPage = ({ projectId }: { projectId: string }) => {
  const eventsQuery = useQuery({
    queryKey: ["audit", projectId],
    queryFn: () => api.auditEvents(projectId),
    refetchInterval: 5000,
  });

  return (
    <div className="surface grid">
      <h2>Audit Trail</h2>
      {(eventsQuery.data?.events ?? []).map((event) => (
        <pre key={String((event as { id?: string }).id ?? JSON.stringify(event))}>
          {JSON.stringify(event, null, 2)}
        </pre>
      ))}
    </div>
  );
};
