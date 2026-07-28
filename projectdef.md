# script: the company brain

**script** is a production application, not a presentational demo. It is built as a `client/` +
`server/` monorepo (see `AGENTS.md` for the engineering contract, `README.md` for the repo index).
This document is the product/requirements source of truth: **what we are building, what ships
today, and what the north star is.**

Marketing and the landing page already frame the product as **the company brain** — one place to
ingest truth, ask anything, and get clearance-aware answers. Engineering docs must use the same
language. Functional and well-designed are both requirements, not a trade-off.

---

## 1. Vision (north star)

**script is the company brain:** a workspace-scoped memory and intelligence layer that reduces
human friction across how a company captures, finds, and acts on truth.

People should not dig through Slack, Drive, email, GitHub, procurement tools, or tribal knowledge
to answer “what did we decide?”, “what’s in our library?”, “was that tender approved?”, or “what
do I do on day one?”. They should **ask the brain** — and get cited, permission-aware answers.

### Product pillars

| Pillar | Meaning |
| --- | --- |
| **Memory** | Company truth lives in one place: documents, (later) system events, voice, chat context |
| **Ask** | Natural-language chat over that memory, with citations you can open and verify |
| **Connect** | Plug in places truth already lives (files today; SaaS and internal systems next) |
| **Act (later)** | Scoped agent tools and workflows (onboarding, reports, guided processes) — never free-form chaos |
| **Clearance** | Answers match what each person is allowed to see (workspace today; finer ACLs over time) |

Landing copy to stay aligned with: *“Ingest the company's truth. Ask anything. Get answers matched
to your clearance.”* · *Ingest → Remember → Ask* · *Meetings become memory* (voice) · *Plug in the
places truth already lives*.

### What “company brain” is *not* (yet)

- Not a generic multi-tenant ChatGPT wrapper with no grounding.
- Not unscoped write access into customer databases.
- Not a promise that every SaaS connector is live on day one — the **architecture** aims there;
  **shipped** scope is called out below.

---

## 2. What ships today (document brain)

The current product is a production-grade **document company brain** — the memory + ask layers for
files:

- **Library**: folders/files, multi-source ingest (local, Drive/Dropbox/OneDrive/Box OAuth import,
  URL), version history, content-hash dedup, reprocess / upload-new-version / cloud re-import by
  `sourceUrl`, side-by-side version diff.
- **RAG chat**: precompute extract/chunk/embed at ingest (ADR 0001); query time is embed-query +
  pgvector over **current** document versions only; streaming Claude answers; citations pinned to
  version/chunk.
- **Workspace tenancy**: auth, memberships, credits, API keys, settings, privacy export/delete.

This is real, end-to-end software — not a mock. Gaps (library-wide inventory tools, system
connectors, agent tool-use, workflows, fine-grained clearance) are **roadmap**, not “pretend they
exist in the API.”

---

## 3. Roadmap toward full company brain

Promoted product bets live in [`pipeline.md`](./pipeline.md). Summary:

| Theme | Direction | Status |
| --- | --- | --- |
| **Library intelligence** | Catalog / one-line summaries / tools so “what’s in my library?” works without fake refusals | **Shipped** (P0: `summary` + list/get tools) |
| **Agent runtime** | Tool-use loop over Library (+ later connectors); `web_search` optional | **Shipped** (P4 Library tools + Tavily web_search) |
| **System connectors** | Slack, Teams, GitHub, Notion, procurement/ERP-style apps — scoped credentials per workspace | Planned (`pipeline.md` P2+) |
| **Activity memory** | Events (who did what when) into the brain with citations | Planned (P2A) |
| **Voice capture** | Speak → transcript → memory (landing “Meetings become memory”) | Planned (P1) |
| **Workflows** | Onboarding and other guided paths with script as partner | Planned |
| **Clearance** | Role / document / connector-scoped answers | Partial (workspace); deeper later |

---

## 4. Frontend

Lives in `client/`. **React 18**, **Vite** (SWC), **TypeScript**, **Tailwind**, **Align-UI**.
Visual rules: `understanding.md`. Marketing landing: `client/src/pages/landing/` +
`client/src/components/landing/` — must stay consistent with this vision.

### Core UI standards

- **Primary color**: `#00B258` (green) in-app; marketing also uses product violet accents.
- **Border radius**: `rounded-20` for modals.
- **Iconography**: Huge Icons only in product UI.
- **Button rule**: `w-fit` by default.

---

## 5. Product capabilities (app layout — current)

### A. Library (company memory — documents)

- Nested folders and files.
- Ingest: local upload, cloud providers (Drive, Dropbox, OneDrive, Box), URL import.
- Real import/processing progress (background jobs).
- Version history, restore (append-only), compare extracted text, upload new version.
- Context actions: move, rename, delete, preview.

### B. AI Chat (ask the brain)

- Persistent composer; @-mentions and drag-into-chat for document scope.
- Streaming answers with citations into Library documents/versions.
- Chat uses an **agent tool loop**: Library tools (`list_library_documents`, `get_document_summary`,
  `search_library`) plus optional `web_search`. Inventory questions should call list tools — not
  claim the brain has no Library access.

### C. Settings & integrations

- Cloud storage OAuth connect/disconnect (file import).
- Workspace switch, members, credits, API keys, security/privacy.
- Future: system connectors and scoped agent credentials surface here.

### D. Authentication

- Signup, login, OTP, password reset — backed by real auth (HttpOnly cookies, ADR 0003).

### E. Marketing landing

- Hero: **The company brain. Ask anything.**
- Problem → Ingest / Remember / Ask → services bento → demo Q&A → Library → voice (coming) →
  clearance → integrations orbit → proof → CTA.
- Landing describes the **product vision**; in-app must not invent capabilities that the API does
  not support. When vision and shipping diverge, docs and UI copy use **Coming soon** / roadmap
  labels (as voice already does).

---

## 6. Data & storage strategy

- **Database**: Neon Postgres + Prisma + **pgvector**.
- **File storage**: `StorageDriver` — UploadThing default, S3/Garage for self-host (`docs/storage.md`).
- **RAG**: precompute at ingest; never re-parse files at chat time (ADR 0001).
- **Versions**: append-only DocumentVersion; current-only RAG (ADR 0008).

---

## 7. Backend requirements

### I. Document processing

- Folder/document CRUD, pagination, versions.
- Background extract → chunk → embed; status the UI can poll.
- Metadata, summaries (future), version APIs.

### II. AI / RAG (and later agents)

- Semantic retrieval over current version chunks; streaming completion (Claude).
- Mentions / document scope; citations with `documentVersionId`.
- **Later:** tool-use orchestrator, library catalog tools, connector tools.

### III. Integration gateway

- **Now:** cloud *file* OAuth (Drive, Dropbox, OneDrive, Box) → import into Library.
- **Later:** system connectors (chat, code, procurement, etc.) with scoped credentials and
  optional event ingest — see `pipeline.md`.

### IV. Auth & tenancy

- JWT/session cookies; workspace siloing on every tenant route.
- Credits gate AI usage (ADR 0006).

---

## 8. Key frontend files

- `client/src/pages/app/LibraryPage.tsx` — Library / versions / import.
- `client/src/pages/app/ChatPage.tsx` — ask the brain (stream + citations).
- `client/src/pages/app/SettingsModal.tsx` — workspace, integrations, billing chrome.
- `client/src/pages/landing/page.tsx` — marketing company-brain story.
- Domain language: `CONTEXT.md`; schema: `server/prisma/schema.prisma`.

---

## 9. Consistency rules for agents

1. Prefer **company brain** / **Library** / **ask** in product prose; reserve “document management
   app” for describing the *current shipped slice*, not the whole product identity.
2. Do not document unshipped connectors or agent writes as if they were live.
3. Promote accepted roadmap items from `pipeline.md` into `TODO.md` only when we commit to build.
4. Landing and `projectdef.md` should not contradict each other; if marketing moves first, update
   this file in the same effort.
