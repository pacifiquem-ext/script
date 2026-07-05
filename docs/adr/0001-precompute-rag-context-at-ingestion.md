---
status: accepted
---

# Precompute document text and chunk embeddings at ingestion; never re-read source files for RAG

Chat needs relevant context from potentially hundreds of documents per workspace, on every
message, with the streaming/low-latency bar set in `AGENTS.md` §5. Re-fetching a file from storage
and re-running OCR/extraction on every chat turn would make retrieval latency scale with document
size and count, and repeats expensive work (OCR, parsing) that never changes for a given file.

**Decision:** document processing happens once, at ingestion, as a background job — not at query
time:

1. On upload, the `Document` is created immediately in a `pending`/`processing` state (real
   progress the frontend can show — see `AGENTS.md` §1 on preserving UI polish for real states).
2. A background job extracts the full text (OCR where needed), splits it into overlapping chunks,
   generates an embedding per chunk, and persists chunk text + embedding vector (pgvector) against
   the `Document`. The document moves to `ready` (or `failed`, with a reason) when done.
3. At chat time, retrieval only: embed the user's query, run a pgvector similarity search over
   already-computed chunk embeddings (scoped to workspace, optionally to specific
   mentioned/dropped documents), and inject the top-K chunk texts into the Claude prompt. This step
   never touches the storage driver or re-parses a source file — it's a database read plus one
   embedding call.

## Consequences

- Query-time latency depends on embedding-the-query + a vector search, not on document size or
  OCR cost — this is what makes chat feel fast regardless of library size.
- Ingestion is necessarily asynchronous: a freshly uploaded document is not immediately
  chat-searchable. The `Document` needs a real status field and the frontend must show real
  progress for it (already required generally by `AGENTS.md` §2.2; this is the concrete case).
- Changing the chunking strategy or embedding model later requires a backfill job to re-embed
  existing documents — budget for that as a maintenance capability, not a one-time script.
  `Document.embeddingModel` / `embeddingDimensions` record what produced current chunks;
  `needsEmbeddingBackfill()` in `@script/shared` detects drift from the active model config.
- Chunk embeddings use **Voyage AI `voyage-3.5` at 1024 dimensions** (ADR 0002).
