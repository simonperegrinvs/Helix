# Testing Strategy

## Layers

1. Domain and invariant tests (`bun test`)
2. Property-based tests (`fast-check`)
3. Adapter and ingress contract suites (`CodexGateway`, external tool adapters, MCP schemas)
4. BDD integration tests (`cucumber-js`)
5. Browser workflow checks (`playwright`)

## Principles

- Prefer behavior over implementation details.
- Use real filesystem/database boundaries where practical.
- Keep index and cache rebuildable.
- Verify MCP as an ingress, not a separate product line.

## Coverage policy

- Overall: 80%+
- Domain: 90%+
- Application: 85%+

Coverage gates are enforced by:

- `bun run test:coverage` at repository root
- `scripts/check-coverage.mjs` against server LCOV output
