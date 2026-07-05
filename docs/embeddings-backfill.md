# Embedding backfill

Per [ADR 0001](./adr/0001-precompute-rag-context-at-ingestion.md) and
[ADR 0002](./adr/0002-voyage-embeddings.md), changing `EMBEDDING_MODEL` or
`EMBEDDING_DIMENSIONS` requires re-chunking/re-embedding existing ready Documents.

## Detection

`Document.embeddingModel` and `Document.embeddingDimensions` record what produced the
current `DocumentChunk` rows. `@script/shared` exports `needsEmbeddingBackfill()` and
`currentEmbeddingModel` for workers and admin tools.

## Job interface (implement with BullMQ in TODO §7)

- **Name:** `embeddings.backfill`
- **Payload:** `{ documentId: string } | { workspaceId: string } | { all: true }`
- **Behavior:** for each targeted `Document` with `status = ready` that fails
  `needsEmbeddingBackfill` negation:
  1. Set status to `processing` (or a dedicated `reembedding` if introduced later).
  2. Delete existing `DocumentChunk` rows for that document.
  3. Re-chunk `extractedText` (do not re-read storage unless `extractedText` is null).
  4. Embed with the active Voyage model/dimensions.
  5. Persist chunks; set `embeddingModel` / `embeddingDimensions`; set `status = ready`
     (or `failed` with reason).
- **Idempotency:** safe to retry; chunk delete happens in the same transaction as insert
  where possible.
- **Scheduling:** manual/ops trigger first; optional cron over `needsEmbeddingBackfill`
  query using the partial index on `(embeddingModel, embeddingDimensions, status)`.

Do not implement ad-hoc one-off SQL updates to vectors — always go through this job so
metadata stays consistent.
