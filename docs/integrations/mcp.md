# MCP Integration

Helix ships a stdio MCP entrypoint in `apps/server/src/entrypoints/mcp.ts`.

## Supported tools

Read-only:

- `projects.list`
- `projects.get_manifest`
- `projects.get_overview`
- `project.search`
- `project.get_synthesis`
- `reports.list`
- `reports.get`
- `audit.tail`

Mutating/propose:

- `ai.chat.start`
- `ai.findings_draft.start`
- `ai.synthesis_draft.start`
- `ai.external_query_draft.start`
- `ai.job.get` (read-only status/result polling)
- `external_query.trigger`
- `import_report.register`
- `knowledge.propose_patch`
- `knowledge.apply_patch` (approval token required)

## Safety model

- `projectId` scoping required for non-global tools.
- All writes route through Vault module path checks.
- Every tool call (success or failure) is audit logged.
