# Document chunking

Ingestion splits extracted text into overlapping character windows before embedding
(`server/src/modules/jobs/extract.ts` → `chunkText`).

| Setting | Value | Source |
| --- | --- | --- |
| Window size | 1200 characters | `CHUNK_SIZE_CHARS` in `@script/shared` |
| Overlap | 200 characters | `CHUNK_OVERLAP_CHARS` |
| Boundary bias | Prefer splitting on the last `\n\n` in the latter 60% of a window | paragraph-aware trim |
| Stored metadata | `startOffset`, `endOffset`, optional `pageNumber` on `DocumentChunk` | citations / canvas jump targets |

Embeddings use Voyage `voyage-3.5` at 1024 dimensions with `input_type: document` at ingest and
`input_type: query` at chat time (ADR 0002). Changing size/overlap/model requires the
`embeddings.backfill` job (`docs/embeddings-backfill.md`).
