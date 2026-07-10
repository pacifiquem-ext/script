# Embedding backfill

Per [ADR 0001](./adr/0001-precompute-rag-context-at-ingestion.md),
[ADR 0002](./adr/0002-voyage-embeddings.md), and
[ADR 0008](./adr/0008-document-version-history.md), changing `EMBEDDING_MODEL` or
`EMBEDDING_DIMENSIONS` requires re-chunking/re-embedding existing ready Documents.

## Detection

`Document.embeddingModel` / `Document.embeddingDimensions` (mirrored from the **current**
`DocumentVersion`) record what produced the chunks used for retrieval. `@script/shared`
exports `needsEmbeddingBackfill()` and `currentEmbeddingModel` for workers and admin tools.

## Job interface

- **Name:** `embeddings-backfill` BullMQ queue (`BACKFILL_QUEUE`)
- **HTTP trigger:** `POST /jobs/embeddings/backfill` (workspace owner/admin) with
  `{ "documentId" }` or `{ "workspaceId" }` (must match active workspace). Global `{ "all": true }`
  is restricted to operator tooling.
- **Failed job inspect:** `GET /jobs/failed` (owner/admin) when `REDIS_URL` is configured.
- **Payload:** `{ documentId: string } | { workspaceId: string } | { all: true }`
- **Behavior:** for each targeted `Document` with `status = ready` that
  `needsEmbeddingBackfill` reports true:
  1. Create a **new** `DocumentVersion` (`changeReason: backfill`) from the current version’s
     storage + `extractedText` so prior version chunks (and citations) remain intact.
  2. Set `processingVersionId`; keep document `status = ready` while current still points at
     the previous version until success.
  3. Re-chunk `extractedText` when present; only re-download/extract when text is null.
  4. Embed with active Voyage model/dimensions (`input_type: document`), batched.
  5. Persist chunks on the **new** version only; promote it to `currentVersionId` on success.
  6. On failure, leave `currentVersionId` unchanged. Backfill does **not** charge ingestion credits.
- **Idempotency:** safe to retry; per-version chunk delete+insert is transactional; usage ledger
  rows are idempotent on `(workspaceId, reason, refType, refId)` for negative deltas.

Do not run ad-hoc SQL updates to vectors — always go through this job so metadata stays consistent.
