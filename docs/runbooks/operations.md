# Operations Runbook

## Health checks

- `GET /health` should return `{ ok: true }`.

## Common incidents

1. Retrieval empty after imports
   - Trigger `reindexProject` by importing or explicit search path.
2. Codex streaming failure
   - Validate Codex CLI and `codex app-server` availability.
3. MCP mutation rejected
   - Ensure valid approval token and non-expired state.

## Data locations

- SQLite: `HELIX_DB_PATH`
- Vault root: `HELIX_VAULT_ROOT`
