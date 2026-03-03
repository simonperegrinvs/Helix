# Local Development Runbook

## Requirements

- Bun 1.3+
- GitHub CLI (for repo workflows)
- Codex CLI with app-server support (for live chat integration)

## Startup

```bash
bun install
bun run dev
```

App + API are served from: `http://localhost:8787`

In this mode, frontend assets are built once at startup.
After frontend changes, rebuild assets with:

```bash
bun run dev:web:build
```

Optional HMR mode (two terminals, two ports):

```bash
bun run dev:server
bun run dev:web
```

## Optional env

- `HELIX_DB_PATH` for SQLite location
- `HELIX_VAULT_ROOT` for project vault root
- `HELIX_FAKE_CODEX=1` for deterministic local testing
- `PORT` for API port
- `HELIX_EXTERNAL_TOOL_MODE=manual|http` for external trigger mode
- `HELIX_EXTERNAL_TOOL_BASE_URL` for HTTP external adapter

## MCP usage

```bash
cd apps/server
bun run src/entrypoints/mcp.ts
```

Send JSON-RPC lines with `tools/list` and `tools/call`.

## Coverage and contracts

```bash
bun run test:coverage
bun run test:e2e
```

Optional live contracts:

- `HELIX_CONTRACT_LIVE_CODEX=1`
- `HELIX_CONTRACT_LIVE_EXTERNAL=1` + `HELIX_CONTRACT_LIVE_EXTERNAL_URL`
