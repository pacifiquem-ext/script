# Public API (API keys)

Authenticate with `Authorization: Bearer sk_live_…` from Settings → Integrations → API Access.
API keys are workspace-scoped (`admin` role equivalent) and rate-limited per key (`rateLimitRpm`, default 60).

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
