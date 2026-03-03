import { DomainError, randomId } from "@helix/shared-kernel";
import type {
  ExternalResearchToolPort,
  ExternalResearchToolTriggerInput,
  ExternalResearchToolTriggerResult,
} from "../application/external-research-tool-port";

export interface HttpExternalToolConfig {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
}

export class HttpExternalResearchToolAdapter implements ExternalResearchToolPort {
  constructor(private readonly config: HttpExternalToolConfig) {}

  async trigger(
    input: ExternalResearchToolTriggerInput,
  ): Promise<ExternalResearchToolTriggerResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15_000);

    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
        },
        body: JSON.stringify({
          projectId: input.projectId,
          queryDraftId: input.queryDraftId,
          queryPackage: input.queryPackage,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new DomainError(
          `External tool request failed (${response.status})`,
          "EXTERNAL_TOOL_HTTP_FAILURE",
        );
      }

      const body = (await response.json()) as Record<string, unknown>;

      return {
        mode: "http",
        accepted: true,
        runId: String(body.runId ?? randomId("external_http_run")),
        payload: body,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
