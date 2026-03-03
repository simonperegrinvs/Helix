const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

export interface ResearchProject {
  projectId: string;
  name: string;
  slug: string;
  vaultPath: string;
  status: string;
  createdAt: string;
}

export interface RetrievedContextItem {
  chunkId: string;
  filePath: string;
  heading: string;
  startLine: number;
  endLine: number;
  excerpt: string;
  sourceType: string;
  confidence: number;
}

export const api = {
  listProjects: () => request<{ projects: ResearchProject[] }>("/api/projects"),
  createProject: (body: { name: string; vaultRoot?: string }) =>
    request<{ project: ResearchProject }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getOverview: (projectId: string) => request(`/api/projects/${projectId}/overview`),
  attachVault: (projectId: string, vaultPath: string) =>
    request<{ project: ResearchProject }>(`/api/projects/${projectId}/attach-vault`, {
      method: "POST",
      body: JSON.stringify({ vaultPath }),
    }),
  importReport: (
    projectId: string,
    body: { sourceType: string; originalFilename: string; content: string },
  ) =>
    request<{ report: unknown }>(`/api/projects/${projectId}/reports/import`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listReports: (projectId: string) =>
    request<{ reports: unknown[] }>(`/api/projects/${projectId}/reports`),
  listFindings: (projectId: string) =>
    request<{ findings: unknown[] }>(`/api/projects/${projectId}/findings`),
  getSynthesis: (projectId: string) =>
    request<{ doc: unknown; content: string }>(`/api/projects/${projectId}/synthesis`),
  updateSynthesis: (projectId: string, body: { content: string; confidence: number }) =>
    request<{ doc: unknown }>(`/api/projects/${projectId}/synthesis`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  draftExternalQuery: (projectId: string, body: { goal: string; userRequest?: string }) =>
    request<{ draft: { queryDraftId: string; queryText: string } }>(
      `/api/projects/${projectId}/external-query/draft`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  listExternalDrafts: (projectId: string) =>
    request<{ drafts: Array<{ queryDraftId: string; goal: string; status: string }> }>(
      `/api/projects/${projectId}/external-query/drafts`,
    ),
  triggerExternalQuery: (projectId: string, queryDraftId: string) =>
    request<{ result: unknown }>(`/api/projects/${projectId}/external-query/trigger`, {
      method: "POST",
      body: JSON.stringify({ queryDraftId }),
    }),
  auditEvents: (projectId: string) =>
    request<{ events: unknown[] }>(`/api/projects/${projectId}/audit/events`),
  proposePatch: (projectId: string, targetPath: string, proposedContent: string) =>
    request<{ proposal: { proposalId: string; diff: string }; approvalToken: string }>(
      `/api/projects/${projectId}/knowledge/patch/propose`,
      {
        method: "POST",
        body: JSON.stringify({ targetPath, proposedContent }),
      },
    ),
  applyPatch: (projectId: string, proposalId: string, approvalToken: string) =>
    request<{ result: unknown }>(`/api/projects/${projectId}/knowledge/patch/apply`, {
      method: "POST",
      body: JSON.stringify({ proposalId, approvalToken }),
    }),
  search: (projectId: string, question: string) =>
    request<{ items: RetrievedContextItem[] }>(
      `/api/projects/${projectId}/search?q=${encodeURIComponent(question)}&max=8`,
    ),
};

export const streamChat = async (
  projectId: string,
  input: { question: string; threadId?: string },
  onEvent: (event: { event: string; data: unknown }) => void,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Unable to stream chat: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n\n")) {
      const splitIndex = buffer.indexOf("\n\n");
      const chunk = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);

      const eventLine = chunk
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.replace("event:", "")
        .trim();
      const dataLine = chunk
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.replace("data:", "")
        .trim();

      if (eventLine && dataLine) {
        onEvent({
          event: eventLine,
          data: JSON.parse(dataLine),
        });
      }
    }
  }
};
