# script

**The company brain.** Ingest company documents, ask in natural language, and get cited answers.

script is a workspace-scoped app: a **Library** for files, **RAG chat** over those files, and an agent that can look things up in the workspace. Teams upload documents, ask questions, and get answers with sources.

## Layout

```
client/            React 18 + Vite (SWC) + TypeScript
server/            Fastify + TypeScript, Prisma + Postgres
packages/shared/   @script/shared — Zod schemas and shared types
```

## Requirements

- Node.js 22.13+
- [pnpm](https://pnpm.io) 9.15
- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector)
- Redis (background ingestion jobs)
- An [Anthropic](https://www.anthropic.com/) API key and a [Voyage AI](https://www.voyageai.com/) API key

## Setup

```bash
pnpm install

cp client/.env.example client/.env
cp server/.env.example server/.env
```

Edit `server/.env` and set at least:

| Variable            | What to put                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | Postgres URL the app uses (pooled, if your host provides one)                                    |
| `DIRECT_URL`        | Unpooled Postgres URL for Prisma migrations                                                      |
| `JWT_SECRET`        | Random 32+ byte hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `REDIS_URL`         | Redis URL, e.g. `redis://127.0.0.1:6379`                                                         |
| `ANTHROPIC_API_KEY` | Chat completions                                                                                 |
| `VOYAGE_API_KEY`    | Document and query embeddings                                                                    |
| `UPLOADTHING_TOKEN` | File storage (or switch `STORAGE_DRIVER=s3` and set the `S3_*` variables)                        |

`client/.env` only needs `VITE_API_URL` (defaults to `http://localhost:4000`).

Apply the database schema, then start the app:

```bash
pnpm --filter @script/server db:deploy
pnpm --filter @script/server db:generate

pnpm dev          # client + API
pnpm dev:app      # client + API + worker
```

- App: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:4000](http://localhost:4000) — `GET /health`, `GET /health/ready`

Chat and document ingestion return `503` until the Anthropic and Voyage keys are set. Optional keys (email, Slack, cloud OAuth, Tavily, and others) are listed in `server/.env.example`.

## Scripts

```bash
pnpm build
pnpm test
pnpm test:coverage
pnpm lint
pnpm typecheck
pnpm format
```

## Stack

TypeScript · React 18 + Vite (SWC) · Fastify · Postgres + Prisma + pgvector · Voyage embeddings · Anthropic Claude · BullMQ / Redis · Resend · pnpm workspaces · Vitest · Prettier + ESLint · TanStack Query
