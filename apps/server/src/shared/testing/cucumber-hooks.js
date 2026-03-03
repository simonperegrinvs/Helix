import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AfterAll, Before, BeforeAll, setDefaultTimeout } from "@cucumber/cucumber";

const state = {
  root: "",
  serverProcess: null,
  baseUrl: "",
  env: {},
};

globalThis.__HELIX_BDD_STATE__ = state;
setDefaultTimeout(30_000);
const currentDir = dirname(fileURLToPath(import.meta.url));
const serverCwd = join(currentDir, "..", "..", "..");

const waitForHealth = async (baseUrl) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // continue retry loop
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not become healthy in time");
};

BeforeAll(async () => {
  const root = join(serverCwd, ".tmp", "bdd", crypto.randomUUID());
  const port = String(8800 + Math.floor(Math.random() * 500));

  await mkdir(root, { recursive: true });

  const env = {
    ...process.env,
    HELIX_DB_PATH: join(root, "bdd.sqlite"),
    HELIX_VAULT_ROOT: join(root, "vaults"),
    HELIX_FAKE_CODEX: "1",
    PORT: port,
  };

  const serverProcess = spawn("bun", ["run", "src/entrypoints/http.ts"], {
    cwd: serverCwd,
    env,
    stdio: "pipe",
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);

  state.root = root;
  state.serverProcess = serverProcess;
  state.baseUrl = baseUrl;
  state.env = env;
});

AfterAll(async () => {
  if (state.serverProcess) {
    state.serverProcess.kill("SIGTERM");
  }
  if (state.root) {
    await rm(state.root, { recursive: true, force: true });
  }
});

Before(function () {
  this.baseUrl = state.baseUrl;
  this.env = state.env;
  this.projectId = "";
  this.report = null;
  this.chatResult = null;
  this.searchResult = null;
  this.draft = null;
  this.patchProposal = null;
  this.patchApplyResult = null;
  this.auditEvents = [];
  this.mcpResult = null;
  this.currentApprovalToken = "";
  this.currentProposalId = "";
});
