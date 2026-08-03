# ADR 0014 — Clearance model and person identity map

## Status

Accepted — 2026-08-03

## Context

Phase 4 is the gate before connectors with source-side permissions. Workspace membership alone is
not an ACL. Phase 3 meetings and Phase 5–6 sources must not leak across clearances.

## Decision

1. **Dual model**
   - **Level clearance** (existing): `WorkspaceMember.clearanceLevel` and resource `clearanceLevel`
     (document/folder). Member may see resource iff `resource.clearanceLevel <= member.clearanceLevel`
     **and** visibility rules pass.
   - **Restricted visibility**: resource `visibility = workspace | restricted`. When `restricted`,
     only users listed in `ResourcePrincipal` may access (still subject to level if set).

2. **ACL capture at ingest** — connectors set `visibility` + principals from source permissions
   (private channel members, repo collaborators). Manual admin APIs can set document/meeting ACL.

3. **Enforcement location** — filtering runs **inside** retrieval SQL (vector seam) and inside every
   tool query, never only after model tool output. Tool context carries `userId`, `clearanceLevel`,
   and resolved `allowedRestrictedResourceIds` helpers.

4. **Person identity map** — `PersonIdentity` maps `(workspaceId, provider, externalId)` → optional
   `userId` + email/displayName. Used for Slack mention → clearance and meeting owner resolution.

5. **Meetings** — default `visibility=workspace` for Fireflies imports; may be set `restricted` to
   participant-matched identities (email match via PersonIdentity / User.email).

6. **Re-evaluation** — connectors re-sync principals on membership change events; admin can patch
   principals. Stale grants are replaced on sync (delete-and-replace for that resource).

## Consequences

- Vector search joins document clearance + optional principal allow-list.
- Tools receive full `AgentToolContext` with user identity.
- Tests prove two-clearance isolation within one workspace.
