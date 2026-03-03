# Helix

Helix is a vault-first research platform for long-running, evidence-grounded AI research workflows.

## Core principles

- Obsidian project folders are canonical.
- Backend modulith owns orchestration and safety.
- UI is the primary workflow.
- MCP is a constrained secondary automation surface.
- AI output is evidence-first and citation-driven.

## Monorepo layout

- `apps/web`: React + Vite workspace UI
- `apps/server`: Bun modulith (HTTP + MCP entrypoints)
- `packages/contracts`: shared domain contracts
- `packages/shared-kernel`: shared utility primitives
- `docs`: architecture, ADRs, module docs, runbooks

## Quickstart

```bash
bun install
bun run dev
```

App + API default: `http://localhost:8787`

`bun run dev` builds the frontend once, then starts the backend in watch mode serving `apps/web/dist`.
Frontend edits require rebuilding with:

```bash
bun run dev:web:build
```

Optional HMR mode (two terminals, two ports):

```bash
bun run dev:server
bun run dev:web
```

## Test commands

```bash
bun run test
bun run test:coverage
bun run test:bdd
bun run test:e2e
```

## Key capabilities

- Project lifecycle with vault attachment
- Safe vault read/write APIs
- Manual report import with normalization
- Project-scoped retrieval and citations
- Grounded chat streaming through Codex gateway
- External research query drafting and manual trigger package
- MCP read-only + propose/apply tools with approval tokens
- Correlated audit trail for HTTP and MCP calls
- Coverage gates and contract suites (with optional live integration modes)

## Definition-of-done alignment

This repository implements the full plan phases (0-5) with module boundaries, tests, docs, and operational workflows.
