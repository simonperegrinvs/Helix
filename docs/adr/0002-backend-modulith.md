# ADR 0002: Backend Is a Modulith

## Status
Accepted

## Decision
Helix ships as a single deployable backend with strong internal module boundaries.

## Consequences
- Lower operational overhead than microservices.
- Boundary rules are enforced through module APIs and docs.
