---
status: accepted
---

# Auth uses HttpOnly cookies with a 15m access JWT and rotating 30d refresh token

The SPA authenticates with an **access JWT (15 minutes)** and a **refresh token (30 days)** both
stored in **HttpOnly, Secure, SameSite=Lax** cookies (`script_access`, `script_refresh`). Refresh
tokens are stored hashed server-side, rotated on each use, and revoked on logout and password
reset. Active workspace is selected via `script_workspace` cookie with `User.lastWorkspaceId` as
fallback; requests may also send `X-Workspace-Id`.

Cookie auth keeps tokens out of `localStorage` (XSS blast radius) and matches credentialed
`fetch` against a locked `CORS_ORIGIN`. CSRF is mitigated with SameSite=Lax plus Origin/Referer
checks on state-changing requests.

Rejected for v1: long-lived JWT in `localStorage`; bearer access token in memory (more client
complexity without clear gain given same-site SPA + API).
