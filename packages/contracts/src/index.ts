export interface Citation {
  filePath: string;
  heading: string;
  startLine: number;
  endLine: number;
  excerpt: string;
  sourceType: "project_note" | "imported_report" | "synthesis" | "finding";
  confidence: number;
}

export interface ResearchProject {
  projectId: string;
  name: string;
  slug: string;
  vaultPath: string;
  status: "active" | "archived";
  createdAt: string;
  settings: Record<string, unknown>;
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

export interface SynthesisDocument {
  projectId: string;
  version: number;
  summaryPath: string;
  updatedAt: string;
  confidence: number;
}

export interface ExternalResearchQueryDraft {
  queryDraftId: string;
  projectId: string;
  goal: string;
  queryText: string;
  constraints: Record<string, unknown>;
  expectedOutputShape: Record<string, unknown>;
  status: "draft" | "approved" | "triggered";
}

export interface AuditEvent {
  id: string;
  projectId: string;
  correlationId: string;
  ingress: "http" | "mcp";
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RetrievedContextItem extends Citation {
  chunkId: string;
}
