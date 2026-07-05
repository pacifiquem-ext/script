# script

AI-powered document management: ingest documents from local upload, cloud providers, or URL, then
chat with an AI layer that has RAG-based context over your Library.

This is a production application being made **fully functional** — not a presentational demo.
The UI already has a premium, consistent design; the work from here is making it real end to end
without regressing that quality. This entire application — backend, AI integration, and the wiring
between them and the existing frontend — is being built by AI agents. `AGENTS.md` is the contract
that governs how.

## Docs index

Read in this order if you're new to the repo:

| Doc                                      | What it's for                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`AGENTS.md`](./AGENTS.md)               | The engineering constitution — rules, tech baseline, skills, workflow. Start here.       |
| [`projectdef.md`](./projectdef.md)       | Product spec: what the app does, what the backend must provide.                          |
| [`understanding.md`](./understanding.md) | Frontend UI/design-system conventions (Align-UI, Huge Icons, tokens).                    |
| [`TODO.md`](./TODO.md)                   | Live task ledger — what's done, in progress, next.                                       |
| [`ENV.md`](./ENV.md)                     | Every environment variable: what exists, what's missing.                                 |
| [`docs/storage.md`](./docs/storage.md)   | File storage strategy — managed default + self-hosted (Garage) option.                   |
| `CONTEXT.md`                             | Domain glossary — created once the first term is resolved (see `domain-modeling` skill). |
| `docs/adr/`                              | Architecture decision records for hard-to-reverse calls.                                 |

## Layout

```
client/    React 18 + Vite (SWC) + TypeScript frontend
server/    Fastify + TypeScript backend, Prisma + Neon Postgres
```

Root-level scripts run both packages via pnpm workspaces.

## Quickstart

```bash
pnpm install

cp client/.env.example client/.env
cp server/.env.example server/.env
# fill in server/.env: Neon DATABASE_URL/DIRECT_URL, storage driver credentials — see ENV.md

pnpm dev          # runs client (Vite) + server (Fastify) together
pnpm build        # builds both
pnpm test         # runs both test suites
pnpm lint         # lints both packages
pnpm typecheck    # type-checks both packages
pnpm format       # formats the whole repo with Prettier
```

Server health checks once running: `GET http://localhost:4000/health` (liveness),
`GET http://localhost:4000/health/ready` (checks the database connection).

## Stack

TypeScript everywhere · React 18 + Vite (SWC) · Fastify · Neon Postgres + Prisma + pgvector ·
Zod · Pino · Anthropic Claude for AI/RAG · pnpm workspaces · Vitest · Prettier + ESLint.

Full rationale and the rules for extending any of this: `AGENTS.md`.

## Self-hosting

This app is designed to be self-hostable without depending on any single vendor account beyond
Neon for the database. File storage defaults to a managed provider but can run entirely on
self-hosted, S3-compatible storage (Garage) — see `docs/storage.md`.
