# ADR 0015 — System connector framework + GitHub pilot

## Status

Accepted — 2026-08-03

## Context

Phase 5 requires a provider-agnostic connector install model (not file OAuth Integrations) and a
first work-system pilot. GitHub is the recommended pilot (explicit ACLs, webhooks, clean install).

## Decision

1. **`SystemConnector`** — workspace-scoped install: `provider`, encrypted credentials
   (`TOKEN_ENCRYPTION_KEY`), scopes JSON, consent timestamp, status, lastSyncAt. Distinct from
   `Integration` (cloud files).

2. **Normalized work model** — `WorkProject` + `WorkItem` (id, title, body, state, assignee,
   project, url, externalId, visibility/clearance for Phase 4).

3. **GitHub v1** — workspace PAT or fine-grained token stored encrypted (GitHub App install can
   replace later without schema thrash). Sync selected repos → projects/items; live tools call
   GitHub API for assignee/state so answers stay fresh.

4. **Tools** — `list_work_items`, `get_work_item`, `search_work_context` (prose via MemoryChunk
   `sourceType=work_item` for READMEs/issue bodies when indexed).

5. **Clearance** — private repos → `visibility=restricted` + principals from collaborator list
   when available; public repos → workspace + clearanceLevel 0.

6. **Settings** — Connectors panel, separate from file Integrations.

## Consequences

- Env optional: none required beyond encryption key; token supplied per workspace in UI.
- Webhook `POST /webhooks/github` for issue events (signature via connector secret or install secret).
