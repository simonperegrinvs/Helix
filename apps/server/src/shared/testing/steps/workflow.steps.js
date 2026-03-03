import assert from "node:assert";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Given, Then, When } from "@cucumber/cucumber";

const currentDir = dirname(fileURLToPath(import.meta.url));
const serverCwd = join(currentDir, "..", "..", "..", "..");

const postJson = async (baseUrl, path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    assert.fail(await response.text());
  }
  return response.json();
};

const getJson = async (baseUrl, path) => {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    assert.fail(await response.text());
  }
  return response.json();
};

const uniqueName = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

const callMcpTool = async (env, name, args) => {
  const child = spawn("bun", ["run", "src/entrypoints/mcp.ts"], {
    cwd: serverCwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  };

  const request = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name,
      arguments: args,
    },
  };

  child.stdin.write(`${JSON.stringify(initRequest)}\n`);
  child.stdin.write(`${JSON.stringify(request)}\n`);
  child.stdin.end();

  const output = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`MCP process exited ${code}: ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
  });

  const parsedLines = String(output)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const response = parsedLines.find((line) => line.id === 2 || line.id === "2");
  assert.ok(response, `No JSON-RPC response for id=2. Raw output: ${String(output).slice(0, 500)}`);

  return response;
};

Given("a research project attached to an Obsidian folder", async function () {
  const created = await postJson(this.baseUrl, "/api/projects", {
    name: uniqueName("BDD Project"),
  });
  this.projectId = created.project.projectId;
  await postJson(this.baseUrl, `/api/projects/${this.projectId}/reports/import`, {
    sourceType: "manual",
    originalFilename: "seed-evidence.md",
    content: "# Seed Evidence\n\nReferences and supporting notes for retrieval.",
  });
});

Given("a project with findings and imported reports", async function () {
  const created = await postJson(this.baseUrl, "/api/projects", {
    name: uniqueName("BDD Evidence Project"),
  });
  this.projectId = created.project.projectId;

  await postJson(this.baseUrl, `/api/projects/${this.projectId}/reports/import`, {
    sourceType: "manual",
    originalFilename: "evidence.md",
    content: "# Evidence\n\n- Finding: Lithium supply volatility remains high.",
  });
});

Given("a project with unresolved questions", async function () {
  const created = await postJson(this.baseUrl, "/api/projects", {
    name: uniqueName("BDD Query Project"),
  });
  this.projectId = created.project.projectId;
});

Given("a project with an existing synthesis note", async function () {
  const created = await postJson(this.baseUrl, "/api/projects", {
    name: uniqueName("BDD Patch Project"),
  });
  this.projectId = created.project.projectId;
  await postJson(this.baseUrl, `/api/projects/${this.projectId}/reports/import`, {
    sourceType: "manual",
    originalFilename: "seed.md",
    content: "# Seed\n\nSynthesis baseline source.",
  });
});

When("the user imports an external report", async function () {
  this.report = await postJson(this.baseUrl, `/api/projects/${this.projectId}/reports/import`, {
    sourceType: "manual",
    originalFilename: "deep-research.md",
    content: "# Deep Research\n\nKey claim with references.",
  });
});

When("the user asks a research question", async function () {
  const response = await fetch(`${this.baseUrl}/api/projects/${this.projectId}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: "What evidence do we have?",
    }),
  });

  assert.equal(response.ok, true);
  const text = await response.text();
  this.chatResult = text;
});

When("the user asks for more research directions", async function () {
  this.draft = await postJson(
    this.baseUrl,
    `/api/projects/${this.projectId}/external-query/draft`,
    {
      goal: "Find contradictory evidence and new references",
    },
  );
});

When("an MCP client calls project.search with a question", async function () {
  this.mcpResult = await callMcpTool(this.env, "project.search", {
    projectId: this.projectId,
    question: "references",
    maxItems: 5,
  });
});

When("an MCP client calls knowledge.propose_patch for the synthesis note", async function () {
  this.mcpResult = await callMcpTool(this.env, "knowledge.propose_patch", {
    projectId: this.projectId,
    targetPath: "04-synthesis/current-synthesis.md",
    proposedContent: "# Current Synthesis\n\nUpdated by MCP patch.",
  });

  const proposal = this.mcpResult.result.content[0].json;
  this.currentProposalId = proposal.proposalId;

  const tokenResponse = await postJson(
    this.baseUrl,
    `/api/projects/${this.projectId}/knowledge/patch/propose`,
    {
      targetPath: "04-synthesis/current-synthesis.md",
      proposedContent: "# Current Synthesis\n\nUpdated by MCP patch.",
    },
  );
  this.currentApprovalToken = tokenResponse.approvalToken;
});

When("the MCP client calls knowledge.apply_patch with an approval token", async function () {
  this.patchApplyResult = await callMcpTool(this.env, "knowledge.apply_patch", {
    projectId: this.projectId,
    proposalId: this.currentProposalId,
    approval_token: this.currentApprovalToken,
  });
});

Then("the report is stored under the project folder", async function () {
  assert.ok(this.report.report.reportId);
  assert.match(this.report.report.originalPath, /02-sources\/imported-reports\/original/);
});

Then("the report is retrievable in project chat", async function () {
  this.searchResult = await getJson(
    this.baseUrl,
    `/api/projects/${this.projectId}/search?q=Deep+Research&max=3`,
  );
  assert.ok(this.searchResult.items.length > 0);
});

Then("the import is recorded in the audit trail", async function () {
  const audit = await getJson(this.baseUrl, `/api/projects/${this.projectId}/audit/events`);
  this.auditEvents = audit.events;
  assert.ok(this.auditEvents.some((event) => event.action === "report_import.import_report"));
});

Then("the answer contains citations to project evidence", function () {
  assert.match(this.chatResult, /event: metadata/);
});

Then("the conversation summary is persisted", async function () {
  const threads = await getJson(this.baseUrl, `/api/projects/${this.projectId}/threads`);
  assert.ok(threads.threads.length > 0);
});

Then("the system creates a reviewable research query draft", function () {
  assert.ok(this.draft.draft.queryDraftId);
});

Then("the draft includes goal, query variants, and filters", function () {
  assert.match(this.draft.draft.queryText, /primaryTerms/);
  assert.match(this.draft.draft.queryText, /inclusionFilters/);
  assert.match(this.draft.draft.queryText, /goal/);
});

Then("the result includes ranked evidence with citations", function () {
  const payload = this.mcpResult.result.content[0].json;
  assert.ok(Array.isArray(payload));
  assert.ok(payload.length > 0);
  assert.ok(payload[0].filePath);
});

Then("the call is recorded in the audit trail", async function () {
  const audit = await getJson(this.baseUrl, `/api/projects/${this.projectId}/audit/events`);
  assert.ok(audit.events.some((event) => event.ingress === "mcp"));
});

Then("the system returns a patch without applying it", function () {
  const payload = this.mcpResult.result.content[0].json;
  assert.ok(payload.proposalId);
  assert.match(payload.diff, /\+Updated by MCP patch\./);
});

Then("the synthesis note is updated in the vault", function () {
  const payload = this.patchApplyResult.result.content[0].json;
  assert.equal(payload.applied, true);
});

Then("the update is recorded in the audit trail", async function () {
  const audit = await getJson(this.baseUrl, `/api/projects/${this.projectId}/audit/events`);
  assert.ok(audit.events.some((event) => event.action === "knowledge.apply_patch"));
});
