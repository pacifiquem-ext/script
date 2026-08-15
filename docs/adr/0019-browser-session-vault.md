# ADR 0019 — Encrypted browser session vault (workflow agent login)

## Status

Accepted — 2026-08-07

## Context

Workflow “Run with agent” uses headless Playwright. Many checklist steps need a logged-in
third-party session (GitHub, SSO portals). Storing passwords is out of scope. Playwright
`storageState` (cookies + origins) is the smallest secret that makes logged-in browsing possible.

Credential storage is a hard-to-reverse choice, so it is recorded here before implementation.

## Decision

1. **`BrowserSessionVault`** — per `(workspaceId, userId, name)` encrypted Playwright
   `storageState` JSON. Encrypt with existing `TOKEN_ENCRYPTION_KEY` (AES-256-GCM).
2. **User-only** — list/load/delete scoped to the owning user. Never returned decrypted on list.
3. **Size cap** 256KB JSON. Invalid shape (no `cookies[]` or `origins[]`) rejected.
4. **Retention** — deleted with user/workspace cascade; user may delete a named vault anytime.
5. **Execute** — optional `browserSessionId` on `POST /workflows/runs/:runId/execute` decrypts
   into a **new** Chromium context. Existing in-memory sessions are not reused across vaults.
6. **Not** a password manager, not shared across workspace members, not used for chat agent tools.

## Consequences

- New env requirement: `TOKEN_ENCRYPTION_KEY` for vault create (same as OAuth tokens).
- P5.8c live logged-in sites still needs a real storageState from the user.
