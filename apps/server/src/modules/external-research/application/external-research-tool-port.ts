export interface ExternalResearchToolTriggerInput {
  projectId: string;
  queryDraftId: string;
  queryPackage: Record<string, unknown>;
}

export interface ExternalResearchToolTriggerResult {
  mode: "manual" | "http";
  accepted: boolean;
  runId: string;
  payload: Record<string, unknown>;
}

export interface ExternalResearchToolPort {
  trigger(input: ExternalResearchToolTriggerInput): Promise<ExternalResearchToolTriggerResult>;
}
