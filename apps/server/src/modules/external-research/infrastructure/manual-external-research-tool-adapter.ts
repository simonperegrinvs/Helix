import { randomId } from "@helix/shared-kernel";
import type {
  ExternalResearchToolPort,
  ExternalResearchToolTriggerInput,
  ExternalResearchToolTriggerResult,
} from "../application/external-research-tool-port";

export class ManualExternalResearchToolAdapter implements ExternalResearchToolPort {
  async trigger(
    input: ExternalResearchToolTriggerInput,
  ): Promise<ExternalResearchToolTriggerResult> {
    return {
      mode: "manual",
      accepted: true,
      runId: randomId("external_manual_run"),
      payload: {
        instructions:
          "Copy this query package into your external research tool and import the returned report back into Helix.",
        queryPackage: input.queryPackage,
      },
    };
  }
}
