# Local Development Runbook

## Requirements

- Bun 1.3+
- GitHub CLI (for repo workflows)
- Codex CLI with app-server support (for live chat integration)

## Startup

```bash
bun install
bun run dev:server
bun run dev:web
```

## Optional env

- `HELIX_DB_PATH` for SQLite location
- `HELIX_VAULT_ROOT` for project vault root
- `HELIX_FAKE_CODEX=1` for deterministic local testing
- `PORT` for API port

## MCP usage

```bash
cd apps/server
bun run src/entrypoints/mcp.ts
```

Send JSON-RPC lines with `tools/list` and `tools/call`.
