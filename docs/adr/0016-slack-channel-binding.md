# ADR 0016 — Slack channel binding and bot surface

## Status

Accepted — 2026-08-03 (builds on ADR 0009 Slack-first)

## Context

Phase 6 requires channel context then bot surface for Slack only. Event transport must stay a
seam for future Socket Mode / self-host.

## Decision

1. **`SlackInstall`** — workspace ↔ Slack team: encrypted bot token, teamId, botUserId, scopes,
   installedByUserId, consentAt.

2. **`ChannelBinding`** — explicit listen record: channelId, channelName, boundBy, retentionDays,
   announcedAt. Creating a binding is a consent event (audit + in-channel announcement message).

3. **Event transport seam**
   - `verifySlackRequest` (signature)
   - `normalizeSlackEvent` → internal `InboundMessageEvent`
   - `handleInboundAgentAsk` → agent runtime (no `Conversation` row required — T0.5)
   - HTTP Events API first; Socket Mode can plug the same normalize + handle path.

4. **Ingest** — bound channel messages → `MemorySource` type `channel` + `MemoryChunk`; deletes
   tombstone/remove chunks; files shared may enqueue Library import when URL downloadable.

5. **Bot surface** — on `app_mention`: add hourglass reaction immediately, run agent with
   clearance from PersonIdentity map, reply in thread, remove/swap reaction; human-readable errors.

6. **Clearance** — private channels → restricted principals from channel members (best-effort
   Slack API); public channels → workspace visibility.

## Consequences

- Env: `SLACK_SIGNING_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` for OAuth install;
  bot token stored per workspace after OAuth.
- WhatsApp history limitation documented in UI when Phase 8 lands (not v1).
