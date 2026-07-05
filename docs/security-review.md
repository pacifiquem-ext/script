# Security review notes (2026-07-05)

Pass over auth, upload, URL import, and API keys:

- Passwords: argon2id; refresh tokens hashed at rest; access JWT 15m HttpOnly cookies.
- CSRF: Origin/Referer checks on cookie-authenticated mutating requests; API keys skip Origin.
- URL import: protocol allowlist, credential ban, DNS resolution private-IP rejection (`src/lib/ssrf.ts`).
- Uploads: MIME allowlist in library service; multipart size capped by `MAX_UPLOAD_BYTES`.
- API keys: SHA-256 hashed secrets, revoke support, per-key RPM limiter, audit log table.
- Residual risks: in-memory API key rate limiter is per-process; enable Redis limiter before multi-node prod.
  OAuth token encryption path awaits provider credentials. No malware scanning on uploads yet.

- **Account deletion:** requires matching email + password; sole-member workspaces cascade delete
  with best-effort storage object removal; shared workspace ownership transfers to admin/member
  (ADR 0007). Export is session-authenticated download only.
