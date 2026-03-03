# Codex Integration

Helix integrates with `codex app-server` through `AppServerCodexGateway`.

## Approach

- Backend composes prompt packet from project context + retrieval citations.
- Gateway starts a Codex app-server process and sends JSON-RPC turn requests.
- Streamed deltas are emitted as conversation tokens over SSE.
- Durable outputs are persisted only after backend validation.

## Safety

- Codex never writes directly to vault paths.
- Changes are proposed then validated via module services.
- Tool actions are audit logged.

## Test mode

- Default is live gateway.
- Deterministic integration tests can set `HELIX_FAKE_CODEX=1`.
- Live Codex gateway contracts can be enabled with `HELIX_CONTRACT_LIVE_CODEX=1`.
