# ADR 0004: Retrieval Behind Adapter Boundary

## Status
Accepted

## Decision
Retrieval is accessed only through module contracts (`retrieveContext`, `reindexProject`).

## Consequences
- Retrieval implementation can change without API churn.
- Citation model remains stable.
