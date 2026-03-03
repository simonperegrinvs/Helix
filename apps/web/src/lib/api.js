const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";
const request = async (path, init) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
            "Content-Type": "application/json",
        },
        ...init,
    });
    if (!response.ok) {
        const body = (await response.json().catch(() => ({})));
        throw new Error(body.error ?? `Request failed: ${response.status}`);
    }
    return (await response.json());
};
export const api = {
    listProjects: () => request("/api/projects"),
    createProject: (body) => request("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
    }),
    getOverview: (projectId) => request(`/api/projects/${projectId}/overview`),
    attachVault: (projectId, vaultPath) => request(`/api/projects/${projectId}/attach-vault`, {
        method: "POST",
        body: JSON.stringify({ vaultPath }),
    }),
    importReport: (projectId, body) => request(`/api/projects/${projectId}/reports/import`, {
        method: "POST",
        body: JSON.stringify(body),
    }),
    listReports: (projectId) => request(`/api/projects/${projectId}/reports`),
    listFindings: (projectId) => request(`/api/projects/${projectId}/findings`),
    getSynthesis: (projectId) => request(`/api/projects/${projectId}/synthesis`),
    updateSynthesis: (projectId, body) => request(`/api/projects/${projectId}/synthesis`, {
        method: "PUT",
        body: JSON.stringify(body),
    }),
    draftExternalQuery: (projectId, body) => request(`/api/projects/${projectId}/external-query/draft`, {
        method: "POST",
        body: JSON.stringify(body),
    }),
    listExternalDrafts: (projectId) => request(`/api/projects/${projectId}/external-query/drafts`),
    triggerExternalQuery: (projectId, queryDraftId) => request(`/api/projects/${projectId}/external-query/trigger`, {
        method: "POST",
        body: JSON.stringify({ queryDraftId }),
    }),
    auditEvents: (projectId) => request(`/api/projects/${projectId}/audit/events`),
    proposePatch: (projectId, targetPath, proposedContent) => request(`/api/projects/${projectId}/knowledge/patch/propose`, {
        method: "POST",
        body: JSON.stringify({ targetPath, proposedContent }),
    }),
    applyPatch: (projectId, proposalId, approvalToken) => request(`/api/projects/${projectId}/knowledge/patch/apply`, {
        method: "POST",
        body: JSON.stringify({ proposalId, approvalToken }),
    }),
    search: (projectId, question) => request(`/api/projects/${projectId}/search?q=${encodeURIComponent(question)}&max=8`),
};
export const streamChat = async (projectId, input, onEvent) => {
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
