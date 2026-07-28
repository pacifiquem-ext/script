# ADR 0008: Document version history

## Status

Accepted — 2026-07-10

## Context

Documents had a single mutable content surface: reprocess deleted and rewrote
`DocumentChunk` rows and `extractedText` in place. That caused:

1. **Lost history** — no way to see or restore prior extracted content.
2. **Broken citations** — chat answers store `chunkId`s; overwriting chunks left
   citations pointing at deleted rows or different text.
3. **Stale / mixed retrieval** — identical re-uploads became unrelated documents;
   reprocess risked serving mid-flight content.
4. **Unsafe failure** — a failed reprocess marked the whole document `failed`
   even when a previous ready version was usable.
5. **Double billing** — retries and same-content reprocess could charge again.

## Decision

Introduce **`DocumentVersion`** as an append-only content snapshot:

- **`Document`** remains the library identity (name, folder, workspace, source).
- **`Document.currentVersionId`** points only at a **ready** version used for RAG
  and the default viewer.
- **`Document.processingVersionId`** tracks an in-flight version; while it runs,
  document **status stays `ready`** if a current version exists so chat keeps
  working.
- **`DocumentChunk`** rows belong to a **`documentVersionId`**. Prior versions’
  chunks are never deleted when a new version succeeds.
- **Rollback** creates a **new** ready version that copies content + chunks from
  a prior ready version (`changeReason: rollback`, `restoredFromVersionId`).
  History is never rewritten.
- **Citations** include `documentVersionId` so previews load the cited snapshot
  via `GET /documents/:id?versionId=`.
- **Credits**: charge on successful ingest with
  `refType=document_version` / `refId=versionId` (retry-safe). Skip charge when
  the version’s `contentHash` matches a prior **ready** version of the same
  document. Workspace upload dedup: same content hash as a ready document returns
  that document without a second charge.
- **Backfill** creates a new version (same text/bytes, new embeddings) so old
  citation chunks remain.

## Consequences

- Retrieval SQL filters `c."documentVersionId" = d."currentVersionId"`.
- Storage cleanup on document delete removes every version’s `storageKey`.
- Existing rows are migrated to version `1` with ids `mig_<documentId>`.
- **Upload new version** (`POST /documents/:id/versions` multipart) attaches revised
  bytes to the same Document; same content hash as current ready version is a no-op.
- **Cloud/URL re-import** with the same `sourceUrl` (`provider://fileId` or absolute URL)
  attaches a new version (`changeReason: import`) instead of creating a sibling Document.
  Indexed by `(workspaceId, sourceUrl)`.
- Version list exposes `createdById` / `createdByName` for audit UI; Library **Compare**
  shows a side-by-side extracted-text diff between two ready versions.
- Chat may receive a short **version changelog** (who / when / reason labels only) —
  never prior body text for retrieval.
- Reprocess / upload-new-version skip the credit balance gate when
  `wouldChargeIngestion` is false (prior ready same hash).
