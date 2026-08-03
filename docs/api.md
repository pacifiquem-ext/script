# Public API (API keys)

Programmatic access to the **company brain** for a workspace (Library + chat), authenticated with
`Authorization: Bearer sk_live_…` from Settings → Integrations → API Access.
API keys are workspace-scoped (`admin` role equivalent) and rate-limited per key (`rateLimitRpm`, default 60).

Product scope: `projectdef.md` (C1–C7 status in §2). Domain terms: `CONTEXT.md`.

**Scope today is the document brain.** Chat turns run the agent tool loop (Library tools +
optional `web_search` — `docs/agent-tools.md`), so API-key callers get the same grounded answers the
SPA does. There are **no** connector, channel, meeting, or workflow endpoints; those capabilities
are unbuilt (`docs/connectors.md`, `docs/workflows.md`).

## Endpoints

| Method | Path                               | Description                        |
| ------ | ---------------------------------- | ---------------------------------- |
| GET    | `/credits`                         | Workspace credit balance           |
| GET    | `/folders`                         | List folders (`parentId` optional) |
| POST   | `/folders`                         | Create folder                      |
| GET    | `/documents`                       | Paginated documents                |
| GET    | `/documents/:id`                   | Document detail + extracted text   |
| POST   | `/documents/import-url`            | Import from URL                    |
| GET    | `/conversations`                   | List conversations                 |
| POST   | `/conversations/:id/messages/sync` | Non-streaming chat turn            |
| POST   | `/conversations/:id/messages`      | SSE streaming chat turn            |

Cookie session auth remains supported for the SPA. Multipart upload (`POST /documents/upload`) requires a browser session today.
Audit events: `GET /api-keys/:id/audit` (session owner/admin).
