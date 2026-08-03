# Org deploy runbook (Org-P9a)

How to run **script** for a paying organization: API + worker + Redis + Postgres/pgvector + object
storage, with license activation and backups.

## Topology

| Process | Role |
| ------- | ---- |
| API (`server`) | HTTP + auth + chat SSE |
| Worker | BullMQ ingestion / embeddings |
| Redis | Job queue |
| Postgres + pgvector | Relational + vectors |
| Garage or S3 / UploadThing | File bytes |

Local compose: `pnpm deps:up` then `pnpm dev:app` (see `docs/local-infra.md`).

Production sketch:

1. Terminate TLS at a reverse proxy (Caddy / nginx / ALB) → API `:4000`.
2. SPA static host with `VITE_API_URL` pointing at the API origin; cookies require same-site or
   carefully configured CORS (`CORS_ORIGIN`).
3. Run **one or more** workers with the same `DATABASE_URL` / `REDIS_URL` / storage env as the API.
4. Health: `GET /health` (liveness), `GET /health/ready` (DB + Redis + storage).

## License activation (Org-P7)

1. Vendor mints a key (private key never on customer hosts):

   ```bash
   LICENSE_PRIVATE_KEY="$(cat vendor-private.pem)" \
     pnpm --filter @script/server exec node -r @swc-node/register src/cli/mint-license.ts \
     --customer acme-corp --seats 25 --days 35
   ```

2. Customer sets `LICENSE_PUBLIC_KEY` (PEM) and either:
   - pastes the key in **Settings → License**, or
   - sets `LICENSE_KEY` once for boot-time bootstrap.
3. Optional hard fail: `LICENSE_ENFORCEMENT=true` (also implied when `LICENSE_PUBLIC_KEY` is set).

Lifecycle: **active** → **grace** (7d, full use + banner) → **read_only** (7d, no writes) → **locked**.

## Seats & invites (Org-P6)

- Seats = distinct users with any workspace membership (install-wide).
- Invites: Settings → People (email / bulk). Tokens expire in 7 days. Mail uses Resend when
  `RESEND_API_KEY` + `EMAIL_FROM` are set; otherwise invites are logged (dev).

## Backups

1. **Postgres**: nightly `pg_dump` (or Neon PITR). Include all schemas; restore with `psql` /
   `prisma migrate deploy` as needed.
2. **Object store**: Garage/S3 bucket versioning or periodic `rclone` sync of the document bucket.
3. **Redis**: ephemeral jobs only — no durable product state required.
4. **Secrets**: store `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `LICENSE_PUBLIC_KEY` in a secret manager;
   rotate per `docs/secret-rotation.md`.

## Checklist before go-live

- [ ] TLS + CORS origins correct for the SPA
- [ ] `REDIS_URL` set; worker process running
- [ ] Storage driver configured (`STORAGE_DRIVER` + credentials)
- [ ] Voyage/Anthropic **or** openai_compatible completion/embeddings (Org-P8)
- [ ] License public key + first activation key
- [ ] Resend (or SMTP later) for invites/OTP
- [ ] Backup job scheduled and restore tested once
