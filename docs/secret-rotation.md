# Secret rotation runbook (Org-P9b)

Rotate secrets without stranding users. Prefer dual-read windows where possible.

## JWT_SECRET

1. Schedule a short maintenance window if possible.
2. Deploy new `JWT_SECRET`.
3. Existing access tokens (15m) fail; refresh tokens still valid until clients re-login if refresh
   signing is independent — **today access + refresh trust `JWT_SECRET` / stored refresh hashes**.
4. Users re-authenticate after rotation. Document in release notes.

## TOKEN_ENCRYPTION_KEY

Used for OAuth tokens at rest.

1. **Do not** rotate blindly: decrypt with old key, re-encrypt with new, or force reconnect of
   integrations.
2. Recommended: add dual-key support only after an ADR; until then, plan reconnect of Drive/etc.
   after rotation.

## LICENSE_PUBLIC_KEY

1. Issue new vendor keypair; mint next month’s keys with the new private key.
2. Deploy new `LICENSE_PUBLIC_KEY` **before** customer applies a key signed by it.
3. Old activations remain in DB; new activations must verify against the new public key.

## API keys (workspace)

1. Create replacement keys in Settings → API keys.
2. Update CI/clients.
3. Revoke old keys.

## RESEND / cloud OAuth client secrets

Rotate in the provider console; update env; restart API. No DB migration.
