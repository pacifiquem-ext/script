# script: AI-Powered Document Management

**script** is a production application, not a presentational demo: document management plus an AI
layer, built as a `client/` + `server/` monorepo (see `AGENTS.md` for the full engineering
contract, `README.md` for the repo index). This document is the product/requirements spec — what
the app does and what the backend must provide to make the existing UI fully real, end to end,
**without losing the consistency and premium feel the UI already has** — functional and
well-designed are both requirements, not a trade-off between them.

---

## 1. Project overview

**script** lets users ingest documents from various sources into a workspace-scoped Library, and
interact with them through an AI chat layer with RAG-based retrieval over that Library.

## 2. Frontend

Lives in `client/`. Built with **React 18**, **Vite** (SWC-based fast refresh), and
**TypeScript**, styled with **Tailwind CSS** and **Align-UI**. Full UI/design-system rules are in
`understanding.md`.

### Core UI standards

- **Primary color**: `#00B258` (green).
- **Border radius**: `rounded-20` (20px) for all modals.
- **Iconography**: strictly Huge Icons.
- **Button rule**: all buttons are `w-fit` with consistent padding.

---

## 3. Product capabilities (app layout)

### A. Library (Document Management)

- **File hierarchy**: folders and files in a nested structure.
- **Smart ingestion (multi-source)**:
  - **Local**: drag-and-drop or browse.
  - **Cloud providers**: Google Drive, Dropbox, OneDrive, Box — hierarchical browsing and
    multi-file selection within each provider's modal, via real OAuth (§5.III).
  - **URL import**: direct document import via URL.
- **Import progress**: real progress reporting for bulk ingestion (backed by the background job
  that performs it, not a simulated timer).
- **Context actions**: move, delete, and view file metadata.

### B. AI Chat (contextual intelligence)

- **Persistent input**: a global chat bar at the bottom of the app.
- **Context ingestion**: drag-and-drop a document from the Library into the chat to load it as
  context for the conversation.
- **Message history**: streaming AI responses, persisted conversation threads.

### C. Settings & Integrations

- **Account connections**: connect/disconnect cloud storage providers.
- **Workspace management**: switch between workspaces.
- **Developer tools**: generate and manage API keys.
- **Security**: password management and authentication settings.

### D. Authentication flow

- Signup, Login, OTP verification, and password reset — UI is fully built; backend must power all
  of it for real (§5.IV).

---

## 4. Data & storage strategy

- **Database**: **Neon** (serverless Postgres) via **Prisma**, with the **pgvector** extension for
  document/chunk embeddings — see `server/prisma/schema.prisma` and `AGENTS.md` §4.
- **File storage**: an internal storage abstraction (`server/src/storage/`) rather than a hard
  dependency on one vendor. Default is **UploadThing** (managed). Anyone self-hosting this app can
  switch to any S3-compatible store via `STORAGE_DRIVER=s3` — **[Garage](https://garagehq.deuxfleurs.fr)**
  is the recommended self-hosted option. Full detail and setup steps: `docs/storage.md`.

## 5. Backend requirements (to support the frontend)

### I. Document Processing API

- **CRUD operations**: manage the folder/file tree structure, paginated.
- **OCR & vectorization**: extract text and create embeddings for every ingested document so the
  AI chat has real retrievable context. Runs as a background job, not inline in the request.
- **Metadata**: store and serve document details (page count, source, creation date).

### II. AI RAG Engine

- **Search & retrieval**: semantic search across the Library based on chat input, via Anthropic
  Claude (see `AGENTS.md` §4 and the `claude-api` skill).
- **Context injection**: handle specific file references passed from the frontend's "drop into
  chat" action.
- **Streaming**: chat responses stream to the client rather than waiting for a full completion.

### III. Integration Gateway (OAuth)

- **Provider bridges**: real OAuth flows for Drive, Dropbox, OneDrive, Box (client IDs/secrets
  pending — see `AGENTS.md` §13).
- **File streaming**: transfer files from external providers into internal storage when the
  frontend triggers an "Import," as a background job with progress the frontend can observe.

### IV. Authentication Service

- **JWT/session**: power the existing Login/Signup/OTP/Reset flows for real.
- **Workspace siloing**: every API request is scoped to the user's active workspace — no
  cross-workspace data leakage under any circumstance.

---

## 6. Key frontend files for reference

- `client/src/pages/app/LibraryPage.tsx` — main document management logic (currently mock data,
  see `AGENTS.md` §10).
- `client/src/pages/app/ChatPage.tsx` — AI interaction layer (currently a canned response, see
  `AGENTS.md` §10).
- `client/src/pages/app/SettingsModal.tsx` — account and integration management.
- `client/src/components/ui/BrandIcons.tsx` — custom provider icons.

Domain entities (User, Workspace, Folder, Document, Conversation, Message, Integration, ApiKey,
Subscription/Credit) are catalogued in `AGENTS.md` §9 pending a confirmed Prisma schema
(`AGENTS.md` §13).
