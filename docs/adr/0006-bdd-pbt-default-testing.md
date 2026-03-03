# ADR 0006: BDD + PBT as Default Test Strategy

## Status
Accepted

## Decision
Use behavior specs for workflow fidelity and property-based tests for invariants.

## Consequences
- Business-level regressions are easier to catch.
- Invariants remain robust under broad random inputs.
