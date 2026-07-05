---
status: accepted
---

# Account data export and deletion defaults for v1

Privacy controls need a concrete blast radius without a payment/compliance vendor yet.

**Export:** `GET /me/export` returns a JSON archive (profile, preferences, memberships, folder/document
metadata, conversation titles and messages) plus time-limited signed download URLs for stored
document objects. Synchronous generation with a soft size guard is enough for v1.

**Deletion:** `DELETE /me` requires the user to confirm by sending their account email and current
password. The account, sessions, OTPs, and memberships are removed. Workspaces where the user is
the **only member** are deleted entirely (DB cascade + best-effort storage object deletes). If the
user is the sole `owner` of a workspace that still has other members, ownership transfers to
another `admin`, else the first remaining `member` promoted to `owner`. Deletion is blocked only
if transfer cannot be completed.

Rejected for v1: deleting shared workspaces out from under other members; async export email jobs.
