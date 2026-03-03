import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { FakeCodexGateway } from "../../modules/conversation/infrastructure/fake-codex-gateway";
import { ManualExternalResearchToolAdapter } from "../../modules/external-research/infrastructure/manual-external-research-tool-adapter";
import { AppContainerCore } from "../infrastructure/app-container-core";

export interface TestContext {
  container: AppContainerCore;
  root: string;
  dbPath: string;
  vaultRoot: string;
}

export const createTestContext = async (name: string): Promise<TestContext> => {
  const root = join(process.cwd(), "apps/server/.tmp", name, crypto.randomUUID());
  const dbPath = join(root, "helix.sqlite");
  const vaultRoot = join(root, "vaults");

  await mkdir(root, { recursive: true });

  process.env.HELIX_DB_PATH = dbPath;
  process.env.HELIX_VAULT_ROOT = vaultRoot;
  process.env.HELIX_FAKE_CODEX = "1";

  const container = new AppContainerCore({
    dbPath,
    codexGateway: new FakeCodexGateway(),
    externalToolPort: new ManualExternalResearchToolAdapter(),
  });

  return {
    container,
    root,
    dbPath,
    vaultRoot,
  };
};

export const destroyTestContext = async (context: TestContext): Promise<void> => {
  await rm(context.root, { recursive: true, force: true });
};
