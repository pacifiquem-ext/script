# script: the company brain

**script** is a production application, not a presentational demo. It is built as a `client/` +
`server/` monorepo (see `AGENTS.md` for the engineering contract, `README.md` for the repo index).
This document is the product/requirements source of truth: **what we are building, what ships
today, and what the north star is.**

Marketing and the landing page already frame the product as **the company brain** — one place to
ingest truth, ask anything, and get clearance-aware answers. Engineering docs must use the same
language. Functional and well-designed are both requirements, not a trade-off.

The owner's definition of the destination is [`product_path.txt`](./product_path.txt); §2 below is
that definition turned into product scope. When the two disagree, `product_path.txt` wins and this
file gets updated.

---

## 1. Vision (north star)

**script is the company brain:** a workspace-scoped memory and intelligence layer that knows
everything about the company and reduces human friction across how a company captures, finds, and
acts on truth.

People should not dig through Slack, Drive, email, GitHub, Jira, call recordings, or tribal
knowledge to answer "what did we decide?", "who's working on this?", "was that tender approved?", or
"what do I do on day one?". They should **ask the brain** — in the app or in the chat tool they
already live in — and get cited, permission-aware answers.

### Product pillars

| Pillar         | Meaning                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| **Memory**     | Company truth lives in one place: documents today; calls, channel history, and work items next            |
| **Ask**        | Natural-language chat over that memory, with citations you can open and verify                            |
| **Connect**    | Plug in places truth already lives — files today; messaging, work systems, and call providers next        |
| **Be present** | The brain answers where people already talk (Slack / Teams / WhatsApp), not only on our website           |
| **Act**        | Workflows and scoped agent tools (onboarding, guided processes) — never free-form chaos                   |
| **Clearance**  | Answers match what each person is allowed to see (workspace today; finer ACLs required before connectors) |

Landing copy to stay aligned with: _"Ingest the company's truth. Ask anything. Get answers matched
to your clearance."_ · _Ingest → Remember → Ask_ · _Meetings become memory_ (calls/voice) · _Plug in
the places truth already lives_.

### What "company brain" is _not_ (yet)

- Not a generic multi-tenant ChatGPT wrapper with no grounding.
- Not unscoped write access into customer databases.
- Not a promise that every connector is live on day one — the **architecture** aims there;
  **shipped** scope is called out in §3.

---

## 2. The seven capability areas

`product_path.txt` defines the destination as seven capabilities. This is the canonical scorecard;
every roadmap doc in the repo must map back to it.

| #      | Capability                              | What it means                                                                                                                     | Status                                                                                                      |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **C1** | **Document brain**                      | Ingest company files; ask; get cited answers                                                                                      | **Shipped**                                                                                                 |
| **C2** | **Agent tools / environment awareness** | The brain calls tools instead of guessing; we keep adding tools as we add domains                                                 | **Shipped (v1)** — Mastra + Library/meetings/work/workflow/web; chat write HITL                             |
| **C3** | **Calls & meeting summaries**           | A calls-summaries provider feeds transcripts, summaries, decisions and owners into memory                                         | **Shipped (v1)** — Fireflies; live sync needs workspace API key                                             |
| **C4** | **Messaging apps as a surface**         | Apps that are tagged, react with a loading emoji, and reply **in thread** — **Slack in v1**, then Teams, then WhatsApp (ADR 0009) | **Shipped (v1 code)** — Slack mention path; OAuth + live Events need Slack app keys                         |
| **C5** | **Channel context**                     | Bound channels become memory — messages, threads and shared files, used in every answer                                           | **Shipped (v1 code)** — bind/ingest/backfill/deletes; not in default RAG until private-channel ACL          |
| **C6** | **Work-system context**                 | Notion, Jira, GitHub — "who's working on this?", "what's project X's overview?"                                                   | **Partial** — GitHub PAT + issue memory + tools; Jira/Notion are Phase 8                                    |
| **C7** | **Workflows**                           | Markdown-authored guided processes (e.g. onboarding) that track and enforce completion                                            | **Shipped (v1)** — author/runner/agent execute/HITL/vault; P5.7 connector verify + P5.8c logged-in E2E open |

Design specs: [`docs/agent-tools.md`](./docs/agent-tools.md) (C2),
[`docs/connectors.md`](./docs/connectors.md) (C3–C6), [`docs/workflows.md`](./docs/workflows.md) (C7).
Committed work lives in `TODO.md`; uncommitted bets live in `pipeline.md`.

### v1 scope: Slack only (ADR 0009)

**The whole product ships with Slack as its only connector app.** C4/C5 v1 means Slack — added to
channels, tagged, acks with a reaction, replies in thread. **Teams is second, WhatsApp third**, both
after v1 is complete; WhatsApp ships with its history limitation stated honestly rather than implied
away. The connector framework stays provider-agnostic, but only the Slack adapter exists at first —
one deep provider is the proof the abstraction works.

**Self-hosting the full product is an open possibility, not a commitment.** Infrastructure already
self-hosts (Redis, Postgres + pgvector, Garage — `docs/local-infra.md`); what is unsolved is a
self-hosted instance receiving inbound third-party events. That is deliberately left open so
decisions can be drafted from it later — see [`docs/connectors.md`](./docs/connectors.md) §9 — and
Phase 6 in `TODO.md` is required to keep the event-transport seam open so it stays possible.

### Cross-cutting prerequisites

Three things are shared infrastructure for C3–C7. Building them per-connector is the main
foreseeable way this roadmap goes wrong:

- **Clearance beyond workspace membership.** Today every member can retrieve every chunk. The first
  private channel or restricted project ingested makes that a leak. ACL-at-ingest plus filtering
  inside retrieval _and_ inside each tool is a **blocker for C4–C6**, not a follow-up.
- **Non-document memory.** ADR 0001 and the chunk schema assume a `DocumentVersion`. A message, an
  issue, and a call transcript need to be embeddable and citable through the same path.
- **Person identity map.** "Who said they'd do X" and "who's working on this" require one person to
  be recognized across Slack, Jira, GitHub, a call transcript, and a script `User`.

---

## 3. What ships today (document brain)

The current product is a production-grade **document company brain** — the memory + ask layers for
files, plus the agent runtime that will carry every future capability:

- **Library**: folders/files, multi-source ingest (local, Drive/Dropbox/OneDrive/Box OAuth import,
  URL), version history, content-hash dedup, reprocess / upload-new-version / cloud re-import by
  `sourceUrl`, side-by-side version diff.
- **RAG chat**: precompute extract/chunk/embed at ingest (ADR 0001); query time is embed-query +
  pgvector over **current** document versions only; streaming Claude answers; citations pinned to
  version/chunk.
- **Agent tool loop**: `list_library_documents`, `get_document_summary`, `search_library`, optional
  `web_search`; deterministic hard route for inventory intents; `tool_call` / `tool_result` streamed
  to the UI; structured `agent_tool_audit` logs.
- **Workspace tenancy**: auth, memberships, credits, API keys, settings, privacy export/delete.

This is real, end-to-end software — not a mock. Everything in C3–C7 is **roadmap**, not "pretend it
exists in the API."

---

## 4. Roadmap toward the full company brain

Promoted product bets live in [`pipeline.md`](./pipeline.md). Committed work lives in `TODO.md`.

| Theme                    | Capability  | Direction                                                                          | Status                                      |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| **Library intelligence** | C1/C2       | Catalog / summaries / tools so "what's in my library?" works                       | **Shipped** (P0)                            |
| **Agent runtime**        | C2          | Tool-use loop over Library (+ later connectors); `web_search` optional             | **Shipped** (P4)                            |
| **Tool platform**        | C2          | Tool registry, clearance-aware tool context, DB audit, webhook entry point         | Planned (T0)                                |
| **Calls & meetings**     | C3          | Calls-summaries provider ingest; decisions/owners extraction                       | Planned (P6)                                |
| **Messaging bots**       | C4          | **Slack in v1**: mention → ack emoji → threaded reply. Teams, then WhatsApp, after | Planned (P7, ADR 0009)                      |
| **Channel context**      | C5          | Bound Slack channels as memory (history, threads, shared files)                    | Planned (P7, ADR 0009)                      |
| **Work systems**         | C6          | Notion, Jira, GitHub — normalized work items + live tools                          | Planned (P3)                                |
| **Workflows**            | C7          | Markdown-authored, run-tracked guided processes                                    | Planned (P5)                                |
| **Activity memory**      | —           | Events (who did what when) from in-house systems, with citations                   | Planned (P2)                                |
| **Voice capture**        | C3-adjacent | In-app record → transcript → memory                                                | Planned (P1)                                |
| **Clearance**            | prereq      | Role / document / connector-scoped answers                                         | Partial (workspace only) — **blocks C4–C6** |

---

## 5. Frontend

Lives in `client/`. **React 18**, **Vite** (SWC), **TypeScript**, **Tailwind**, **Align-UI**.
Visual rules: `understanding.md`. Marketing landing: `client/src/pages/landing/` +
`client/src/components/landing/` — must stay consistent with this vision.

### Core UI standards

- **Primary color**: `#00B258` (green) in-app; marketing also uses product violet accents.
- **Border radius**: `rounded-20` for modals.
- **Iconography**: Huge Icons only in product UI.
- **Button rule**: `w-fit` by default.

---

## 6. Product capabilities (app layout)

### A. Library (company memory — documents) — shipped

- Nested folders and files.
- Ingest: local upload, cloud providers (Drive, Dropbox, OneDrive, Box), URL import.
- Real import/processing progress (background jobs).
- Version history, restore (append-only), compare extracted text, upload new version.
- Context actions: move, rename, delete, preview.

### B. AI Chat (ask the brain) — shipped

- Persistent composer; @-mentions and drag-into-chat for document scope.
- Streaming answers with citations into Library documents/versions.
- Agent tool loop with live tool status; inventory questions call list tools rather than claiming the
  brain has no Library access.

### C. Settings & integrations — shipped (files)

- Cloud storage OAuth connect/disconnect (file import).
- Workspace switch, members, credits, API keys, security/privacy.

### D. Authentication — shipped

- Signup, login, OTP, password reset — backed by real auth (HttpOnly cookies, ADR 0003).

### E. Marketing landing — shipped

- Hero: **The company brain. Ask anything.**
- Problem → Ingest / Remember / Ask → services bento → demo Q&A → Library → voice (coming) →
  clearance → integrations orbit → proof → CTA.
- Landing describes the **product vision**; in-app must not invent capabilities the API does not
  support. When vision and shipping diverge, docs and UI copy use **Coming soon** / roadmap labels.

### F. Connectors — roadmap (C3–C6)

A surface distinct from file Integrations: install with scoped credentials, choose what the brain
listens to (channels, projects, repos), see and revoke consent, set retention.
Spec: [`docs/connectors.md`](./docs/connectors.md).

### G. Workflows — roadmap (C7)

Markdown editor for authors; run view with tracked checklist for runners; brain-assisted "what's
next". Spec: [`docs/workflows.md`](./docs/workflows.md).

### H. Meetings & calls — roadmap (C3)

Call/meeting records with transcript, summary, participants, decisions and action items, citable
back to the moment in the call. Spec: [`docs/connectors.md`](./docs/connectors.md) §5.

---

## 7. Data & storage strategy

- **Database**: Neon Postgres + Prisma + **pgvector**.
- **File storage**: `StorageDriver` — UploadThing default, S3/Garage for self-host (`docs/storage.md`).
- **RAG**: precompute at ingest; never re-parse files at chat time (ADR 0001).
- **Versions**: append-only DocumentVersion; current-only RAG (ADR 0008).
- **Roadmap**: memory rows that are not documents (messages, work items, transcripts) must reuse the
  same chunk + embedding + citation path — one retrieval story, many sources.

---

## 8. Backend requirements

### I. Document processing — shipped

- Folder/document CRUD, pagination, versions.
- Background extract → chunk → embed; status the UI can poll.
- Metadata, summaries, version APIs.

### II. AI / RAG / agents — shipped for documents

- Semantic retrieval over current version chunks; streaming completion (Claude).
- Mentions / document scope; citations with `documentVersionId`.
- Tool-use orchestrator with Library tools + `web_search`.
- **Roadmap**: tool registry, clearance-aware tool context, per-tool audit rows, and a webhook entry
  point so the same runtime serves messaging bots ([`docs/agent-tools.md`](./docs/agent-tools.md) §4).

### III. Integration gateway

- **Now:** cloud _file_ OAuth (Drive, Dropbox, OneDrive, Box) → import into Library.
- **Later:** connectors for messaging, work systems and call providers, with scoped credentials,
  event ingest, consent and retention — see [`docs/connectors.md`](./docs/connectors.md).

### IV. Auth & tenancy

- JWT/session cookies; workspace siloing on every tenant route.
- Credits gate AI usage (ADR 0006).
- **Roadmap**: identity beyond a logged-in session — platform identities (Slack/Teams/WhatsApp users)
  must resolve to clearance before the bot answers them.

---

## 9. Key frontend files

- `client/src/pages/app/LibraryPage.tsx` — Library / versions / import.
- `client/src/pages/app/ChatPage.tsx` — ask the brain (stream + citations + tool status).
- `client/src/pages/app/SettingsModal.tsx` — workspace, integrations, billing chrome.
- `client/src/pages/landing/page.tsx` — marketing company-brain story.
- Domain language: `CONTEXT.md`; schema: `server/prisma/schema.prisma`.

---

## 10. Consistency rules for agents

1. Prefer **company brain** / **Library** / **ask** in product prose; reserve "document management
   app" for describing the _current shipped slice_, not the whole product identity.
2. Do not document unshipped connectors, bots, workflows, or agent writes as if they were live. Use
   the C1–C7 status table in §2 as the single answer to "is this shipped?".
3. Promote accepted roadmap items from `pipeline.md` into `TODO.md` only when we commit to build.
4. Landing and `projectdef.md` should not contradict each other; if marketing moves first, update
   this file in the same effort.
5. New capability areas get a **spec doc under `docs/`** and a row in §2 before code — not a schema
   migration first (`AGENTS.md` §15).
