# Testing Strategy

## Layers

1. Domain and invariant tests (`bun test`)
2. Property-based tests (`fast-check`)
3. BDD integration tests (`cucumber-js`)
4. Browser flow checks (`playwright`)

## Principles

- Prefer behavior over implementation details.
- Use real filesystem/database boundaries where practical.
- Keep index and cache rebuildable.
- Verify MCP as an ingress, not a separate product line.

## Coverage policy

- Overall: 80%+
- Domain: 90%+
- Application: 85%+
