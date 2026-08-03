# ADR 0013 — Meetings as company memory (C3)

## Status

Accepted — 2026-08-03 (owner authorized third-party vendor selection).

## Context

Calls/meeting summaries are C3 on the product path. A prior agent draft chose “generic paste only”
without asking; that was rejected. The owner then authorized choosing a third-party vendor.

## Decision

1. **v1 provider: [Fireflies.ai](https://fireflies.ai)** GraphQL API + webhooks.
   - Workspace connects with a Fireflies API key (encrypted at rest via `TOKEN_ENCRYPTION_KEY`).
   - Inbound `Transcription completed` webhooks (HMAC `X-Hub-Signature`) import transcripts.
   - Manual **Sync** pulls recent transcripts for the connected workspace.
2. **Normalization** — Fireflies sentences (speaker + start/end seconds) → `MemoryChunk` segments;
   summary from Fireflies overview/short_summary; participants from meeting_attendees.
3. **Commitments** — Prefer Fireflies `summary.action_items` when present; otherwise **model
   extraction** (completion provider, structured JSON) — not regex heuristics.
4. **Inventory routing** — Catalog intents use a **model classifier** (cheap structured completion)
   shared with library inventory, not product-facing regex NLU.
5. **Workspace-visible** v1 (Phase 4 upgrades to participant-scoped clearance).
6. **Citations** — `sourceType: meeting`, `meetingId`, `startMs`, `speaker`.

## Alternatives considered

- Otter, Grain, Recall.ai, AssemblyAI-only — Fireflies is a mature transcript+summary+action_items
  GraphQL surface with webhooks, fitting “calls-summaries provider” without building a bot attendee.

## Consequences

- New env: optional install-level `FIREFLIES_WEBHOOK_SECRET` (HMAC); API keys are per-workspace.
- Credits: meeting ingest charges `INGESTION_CREDIT_COST` like documents; model commitment extract
  may charge chat-scale usage when Fireflies action_items are empty.
- Consent: admins connect Fireflies deliberately; product copy must not claim silent call recording.
