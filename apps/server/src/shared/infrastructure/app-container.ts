import { AppServerCodexGateway } from "../../modules/conversation/infrastructure/app-server-codex-gateway";
import { FakeCodexGateway } from "../../modules/conversation/infrastructure/fake-codex-gateway";
import { HttpExternalResearchToolAdapter } from "../../modules/external-research/infrastructure/http-external-research-tool-adapter";
import { ManualExternalResearchToolAdapter } from "../../modules/external-research/infrastructure/manual-external-research-tool-adapter";
import { AppContainerCore } from "./app-container-core";

const createExternalToolAdapter = () => {
  const mode = process.env.HELIX_EXTERNAL_TOOL_MODE ?? "manual";
  if (mode === "http") {
    const baseUrl = process.env.HELIX_EXTERNAL_TOOL_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "HELIX_EXTERNAL_TOOL_BASE_URL is required when HELIX_EXTERNAL_TOOL_MODE=http",
      );
    }

    return new HttpExternalResearchToolAdapter({
      baseUrl,
      token: process.env.HELIX_EXTERNAL_TOOL_TOKEN,
      timeoutMs: Number(process.env.HELIX_EXTERNAL_TOOL_TIMEOUT_MS ?? 15_000),
    });
  }

  return new ManualExternalResearchToolAdapter();
};

export class AppContainer extends AppContainerCore {
  constructor() {
    super({
      codexGateway:
        process.env.HELIX_FAKE_CODEX === "1" ? new FakeCodexGateway() : new AppServerCodexGateway(),
      externalToolPort: createExternalToolAdapter(),
    });
  }
}
