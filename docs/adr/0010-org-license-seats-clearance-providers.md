# ADR 0010 — Org license, seats, clearance, and pluggable AI providers

## Status

Accepted — 2026-08-03

## Context

The org-ready track (Org-P7 → Org-P9b in `pipeline.md` / `TODO.md`) requires commercial control
for self-hosted deploys (signed activation keys, seat caps, email invites), ops (audit, runbooks),
pluggable completion/embeddings for data-sovereign orgs, and an enterprise gate (SSO, clearance,
retention / air-gap documentation).

## Decisions

### 1. Install-scoped license (Org-P7)

- One **install** has at most one active `LicenseActivation` (singleton row).
- Keys are **ed25519-signed** compact tokens (`script1.<payload_b64url>.<sig_b64url>`).
- Payload claims: `licenseId`, `customerId`, `seats`, `issuedAt`, `expiresAt`, optional `features`.
- Customer deploy holds `LICENSE_PUBLIC_KEY` (and optional env `LICENSE_KEY` bootstrap). Private key
  is **never** shipped; mint CLI runs only with `LICENSE_PRIVATE_KEY` for vendors.
- Lifecycle: **active** → **grace** (7d, full use + banner) → **read_only** (7d, no writes) →
  **locked** (only license activation allowed for owner/admin).
- When `LICENSE_PUBLIC_KEY` is unset and `LICENSE_ENFORCEMENT` is not `true`, the install is
  **open-dev**: phase `active`, seats effectively unlimited (local OSS / CI). Production with
  enforcement set fails closed without a valid activation.

### 2. Seats & invites (Org-P6)

- Seat usage = count of **distinct users** with any `WorkspaceMember` row (install-wide).
- Pending invites that would exceed `seats` are rejected.
- Invites are tokenized email rows (`WorkspaceInvite`); accept path creates membership after
  signup/login. Shared credits remain on `CreditBalance` (no per-user wallets).

### 3. Audit (Org-P9a)

- `AuditEvent` rows for privileged actions: license activate, invite create/resend/revoke/accept,
  member role change/remove, SSO login, clearance changes.
- Deploy/backup runbooks live under `docs/` (not code).

### 4. Pluggable providers (Org-P8)

- `COMPLETION_PROVIDER`: `anthropic` (default) | `openai_compatible` (Ollama / vLLM / OpenAI-shaped).
- `EMBEDDING_PROVIDER`: `voyage` (default) | `openai_compatible`.
- Seams live under `server/src/modules/ai/`; chat and ingestion call interfaces, not SDKs directly.

### 5. Enterprise gate (Org-P9b) — v1 slice

- **SSO**: optional OIDC (authorization code) via env; password auth remains.
- **Clearance**: integer `clearanceLevel` on `WorkspaceMember`, `Folder`, and `Document` (0 =
  visible to all members). Retrieval and library list filter `document.clearanceLevel <= member.clearanceLevel`.
  Full ACL re-eval from external sources remains later (capability Phase 4).
- **Retention / air-gap / secret rotation**: documented runbooks; no fake “legal hold” product surface.

## Consequences

- Write paths (upload, chat send, invite, integration connect) call `assertLicenseAllowsWrite()`.
- New env vars documented in `ENV.md` and `server/.env.example`.
- Tests cover license lifecycle, seat cap, invite accept, clearance filter, and provider selection.
