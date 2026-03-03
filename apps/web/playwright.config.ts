import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:8787",
  },
  webServer: {
    command: "bun run dev",
    port: 8787,
    cwd: repoRoot,
    reuseExistingServer: true,
    env: {
      ...process.env,
      HELIX_FAKE_CODEX: "1",
      HELIX_DB_PATH: "/tmp/helix-e2e.sqlite",
      HELIX_VAULT_ROOT: "/tmp/helix-e2e-vault",
    },
  },
});
