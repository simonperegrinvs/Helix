# External Tool Integration

Helix supports two external research trigger adapters behind `ExternalResearchToolPort`.

## Modes

- `manual` (default): returns a copy-ready query package for human-triggered tooling.
- `http`: posts the query package to `${HELIX_EXTERNAL_TOOL_BASE_URL}/trigger`.

## Environment

- `HELIX_EXTERNAL_TOOL_MODE=manual|http`
- `HELIX_EXTERNAL_TOOL_BASE_URL` (required for `http` mode)
- `HELIX_EXTERNAL_TOOL_TOKEN` (optional bearer token)
- `HELIX_EXTERNAL_TOOL_TIMEOUT_MS` (optional, default 15000)

## Contract suites

- Deterministic contract tests run by default for manual + local HTTP adapters.
- Optional live external contract can be enabled with:
  - `HELIX_CONTRACT_LIVE_EXTERNAL=1`
  - `HELIX_CONTRACT_LIVE_EXTERNAL_URL`
  - `HELIX_CONTRACT_LIVE_EXTERNAL_TOKEN` (optional)
