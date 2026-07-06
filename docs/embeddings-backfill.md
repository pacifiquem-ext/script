# Embedding backfill

Per [ADR 0001](./adr/0001-precompute-rag-context-at-ingestion.md) and
[ADR 0002](./adr/0002-voyage-embeddings.md), changing `EMBEDDING_MODEL` or
`EMBEDDING_DIMENSIONS` requires re-chunking/re-embedding existing ready Documents.

## Detection

`Document.embeddingModel` and `Document.embeddingDimensions` record what produced the
current `DocumentChunk` rows. `@script/shared` exports `needsEmbeddingBackfill()` and
`currentEmbeddingModel` for workers and admin tools.

## Job interface

- **Name:** `embeddings-backfill` BullMQ queue (`BACKFILL_QUEUE`)
- **HTTP trigger:** `POST /jobs/embeddings/backfill` (workspace owner/admin) with
  `{ "documentId" }` or `{ "workspaceId" }` (must match active workspace). Global `{ "all": true }`
  is restricted to operator tooling.
- **Failed job inspect:** `GET /jobs/failed` (owner/admin) when `REDIS_URL` is configured.
- **Payload:** `{ documentId: string } | { workspaceId: string } | { all: true }`
- **Behavior:** for each targeted `Document` with `status = ready` that
  `needsEmbeddingBackfill` reports true:
  1. Set status to `processing` with `processingPhase` progress markers.
  2. Re-chunk `extractedText` when present; only re-download/extract when text is null.
  3. Embed with active Voyage model/dimensions (`input_type: document`), batched.
  4. Replace `DocumentChunk` rows (offsets preserved) and update embedding metadata.
  5. Set `status = ready` or `failed` with reason. Backfill does **not** charge ingestion credits.
- **Idempotency:** safe to retry; chunk delete+insert is transactional; usage ledger rows are
  idempotent on `(workspaceId, reason, refType, refId)` for negative deltas.

Do not run ad-hoc SQL updates to vectors — always go through this job so metadata stays consistent.
