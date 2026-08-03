# Retention & admin export (Org-P9b)

## Workspace retention hint

`Workspace.retentionDays` stores an optional admin policy hint (days to keep documents/messages).
Enforcement of automatic purge is **not** a silent background delete in v1 — ops should use:

- Privacy export / account deletion (ADR 0007)
- Manual library delete
- Future job once legal hold is specified

## Admin export

- User privacy export remains the path for personal data.
- Workspace-wide legal hold / e-discovery is **documented intent**, not a separate product surface
  yet. Do not claim “legal hold” in the UI until a dedicated ADR ships.

## Clearance

Integer `clearanceLevel` on members, folders, and documents (default `0`). Members only retrieve
documents with `document.clearanceLevel <= member.clearanceLevel`. Owners/admins set member
clearance in Settings → People. This is **workspace-local clearance**, not full source-ACL
re-evaluation (capability Phase 4).
