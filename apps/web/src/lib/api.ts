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

export interface Citation {
  filePath: string;
  heading: string;
  startLine: number;
  endLine: number;
  excerpt: string;
  sourceType: "project_note" | "imported_report" | "synthesis" | "finding";
  confidence: number;
}

export interface ImportedReport {
  reportId: string;
  projectId: string;
  sourceType: string;
  originalFilename: string;
  originalPath: string;
  normalizedPath: string;
  importedAt: string;
  metadata: Record<string, unknown>;
}

export interface Finding {
  findingId: string;
  projectId: string;
  statement: string;
  status: "supported" | "tentative" | "contradicted";
  isHypothesis: boolean;
  citations: Citation[];
  tags: string[];
}

export interface FindingDraftSuggestion {
  statement: string;
  status: "supported" | "tentative" | "contradicted";
  isHypothesis: boolean;
  citations: Citation[];
  tags: string[];
}

export interface ExternalQueryDraft {
  queryDraftId: string;
  projectId: string;
  goal: string;
  queryText: string;
  constraints: Record<string, unknown>;
  expectedOutputShape: Record<string, unknown>;
  status: "draft" | "approved" | "triggered";
}

export type AiStreamAction =
  | "chat_turn"
  | "findings_draft"
  | "synthesis_draft"
  | "external_query_draft";

export interface AiStageEvent {
  type: "stage";
  action: AiStreamAction;
  stage: string;
  message: string;
  percent: number;
  at: string;
}

export interface AiTokenEvent {
  type: "token";
  action: AiStreamAction;
  text: string;
}

export interface AiArtifactEvent {
  type: "artifact";
  action: AiStreamAction;
  name: string;
  data: unknown;
}

export interface AiDoneEvent<TResult> {
  type: "done";
  action: AiStreamAction;
  source?: "codex" | "fallback";
  durationMs: number;
  result: TResult;
}

export interface AiErrorEvent {
  type: "error";
  action: AiStreamAction;
  error: string;
  code?: string;
}

export type AiStreamEvent<TResult> =
  | AiStageEvent
  | AiTokenEvent
  | AiArtifactEvent
  | AiDoneEvent<TResult>
  | AiErrorEvent;

export interface FindingsDraftResult {
  suggestions: FindingDraftSuggestion[];
  generatedBy: "codex";
}

export interface SynthesisDraftResult {
  content: string;
  confidence: number;
  citations: Citation[];
  generatedBy: "codex";
}

export interface ExternalQueryDraftResult {
  draft: ExternalQueryDraft;
}

export interface ChatTurnResult {
  response: string;
  turnId: string;
  threadId: string;
  citations: Array<{ filePath: string; heading: string }>;
}

const parseSseChunk = (chunk: string): { event: string; data: string } | null => {
  const lines = chunk.split("\n");
  let eventName = "message";
  const dataParts: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataParts.push(line.slice("data:".length).trim());
    }
  }

  if (dataParts.length === 0) {
    return null;
  }

  return {
    event: eventName,
    data: dataParts.join("\n"),
  };
};

const streamAction = async <TResult>(
  path: string,
  body: unknown,
  onEvent: (event: AiStreamEvent<TResult>) => void,
  signal?: AbortSignal,
): Promise<TResult> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Unable to stream action: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneResult: TResult | null = null;

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

      const parsedChunk = parseSseChunk(chunk);
      if (!parsedChunk) {
        continue;
      }

      const parsedEvent = JSON.parse(parsedChunk.data) as AiStreamEvent<TResult>;
      onEvent(parsedEvent);

      if (parsedEvent.type === "error") {
        throw new Error(parsedEvent.error);
      }

      if (parsedEvent.type === "done") {
        doneResult = parsedEvent.result;
      }
    }
  }

  if (!doneResult) {
    throw new Error("Stream ended before completion");
  }

  return doneResult;
};

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
    request<{ reports: ImportedReport[] }>(`/api/projects/${projectId}/reports`),
  getReportContent: (projectId: string, reportId: string) =>
    request<{ report: ImportedReport; normalizedContent: string }>(
      `/api/projects/${projectId}/reports/${reportId}/content`,
    ),
  listFindings: (projectId: string) =>
    request<{ findings: Finding[] }>(`/api/projects/${projectId}/findings`),
  createFinding: (
    projectId: string,
    body: {
      statement: string;
      status: Finding["status"];
      isHypothesis?: boolean;
      citations: Citation[];
      tags?: string[];
    },
  ) =>
    request<{ finding: Finding }>(`/api/projects/${projectId}/findings`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSynthesis: (projectId: string) =>
    request<{ doc: unknown; content: string }>(`/api/projects/${projectId}/synthesis`),
  updateSynthesis: (projectId: string, body: { content: string; confidence: number }) =>
    request<{ doc: unknown }>(`/api/projects/${projectId}/synthesis`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  listExternalDrafts: (projectId: string) =>
    request<{ drafts: ExternalQueryDraft[] }>(`/api/projects/${projectId}/external-query/drafts`),
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

export const streamChat = (
  projectId: string,
  input: { question: string; threadId?: string },
  onEvent: (event: AiStreamEvent<ChatTurnResult>) => void,
  signal?: AbortSignal,
): Promise<ChatTurnResult> =>
  streamAction<ChatTurnResult>(`/api/projects/${projectId}/chat/stream`, input, onEvent, signal);

export const streamFindingsDraft = (
  projectId: string,
  input: { maxItems?: number },
  onEvent: (event: AiStreamEvent<FindingsDraftResult>) => void,
  signal?: AbortSignal,
): Promise<FindingsDraftResult> =>
  streamAction<FindingsDraftResult>(
    `/api/projects/${projectId}/findings/draft/stream`,
    input,
    onEvent,
    signal,
  );

export const streamSynthesisDraft = (
  projectId: string,
  input: { selectedFindingIds: string[] },
  onEvent: (event: AiStreamEvent<SynthesisDraftResult>) => void,
  signal?: AbortSignal,
): Promise<SynthesisDraftResult> =>
  streamAction<SynthesisDraftResult>(
    `/api/projects/${projectId}/synthesis/draft/stream`,
    input,
    onEvent,
    signal,
  );

export const streamExternalQueryDraft = (
  projectId: string,
  input: { goal: string; userRequest?: string },
  onEvent: (event: AiStreamEvent<ExternalQueryDraftResult>) => void,
  signal?: AbortSignal,
): Promise<ExternalQueryDraftResult> =>
  streamAction<ExternalQueryDraftResult>(
    `/api/projects/${projectId}/external-query/draft/stream`,
    input,
    onEvent,
    signal,
  );
