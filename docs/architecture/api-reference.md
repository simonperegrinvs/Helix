# API Reference (v0.1)

## HTTP

- `GET /health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId/overview`
- `POST /api/projects/:projectId/attach-vault`
- `GET /api/projects/:projectId/tree`
- `POST /api/projects/:projectId/reports/import`
- `GET /api/projects/:projectId/reports`
- `GET /api/projects/:projectId/reports/:reportId`
- `GET /api/projects/:projectId/reports/:reportId/content`
- `GET /api/projects/:projectId/findings`
- `POST /api/projects/:projectId/findings`
- `POST /api/projects/:projectId/findings/draft`
- `GET /api/projects/:projectId/synthesis`
- `PUT /api/projects/:projectId/synthesis`
- `POST /api/projects/:projectId/synthesis/draft`
- `GET /api/projects/:projectId/search`
- `GET /api/projects/:projectId/threads`
- `GET /api/projects/:projectId/threads/:threadId/turns`
- `POST /api/projects/:projectId/chat/stream`
- `POST /api/projects/:projectId/external-query/draft`
- `GET /api/projects/:projectId/external-query/drafts`
- `POST /api/projects/:projectId/external-query/trigger`
- `POST /api/projects/:projectId/knowledge/patch/propose`
- `POST /api/projects/:projectId/knowledge/patch/apply`
- `GET /api/projects/:projectId/audit/events`

## MCP (JSON-RPC)

- `initialize`
- `tools/list`
- `tools/call` with tool names from MCP integration doc
