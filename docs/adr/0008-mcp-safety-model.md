# ADR 0008: MCP Safety Model

## Status
Accepted

## Decision
MCP writes use propose/review/apply with approval tokens and vault validations.

## Consequences
- Fails closed for unauthorized writes.
- All mutation paths remain auditable.
