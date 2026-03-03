# Architecture Overview

```mermaid
flowchart LR
    UI[React UI] --> HTTP[HTTP API]
    MCPCLIENT[MCP Client] --> MCP[MCP stdio server]

    HTTP --> WORKSPACE
    HTTP --> REPORTS
    HTTP --> RETRIEVAL
    HTTP --> CONVERSATION
    HTTP --> KNOWLEDGE
    HTTP --> EXTERNAL
    HTTP --> AUDIT

    MCP --> MCPIF[MCP Interface]
    MCPIF --> WORKSPACE
    MCPIF --> RETRIEVAL
    MCPIF --> KNOWLEDGE
    MCPIF --> REPORTS
    MCPIF --> EXTERNAL
    MCPIF --> AUDIT

    CONVERSATION --> CODEX[CodexGateway]
    CODEX --> APPSERVER[Codex app-server]

    WORKSPACE --> VAULT[Obsidian project folder]
    REPORTS --> VAULT
    KNOWLEDGE --> VAULT
    RETRIEVAL --> IDX[FTS index]

    HTTP --> DB[(SQLite)]
    MCPIF --> DB
```

## Runtime boundaries

- Vault files are canonical research assets.
- SQLite stores platform/application state.
- Retrieval index is derived and rebuildable.
- Codex integration is adapter-bound (`CodexGateway`).
- MCP ingress maps to existing app services and contains no domain logic.
