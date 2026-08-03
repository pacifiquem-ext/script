# pgvector on Neon

The Prisma schema enables the `vector` extension via `postgresqlExtensions`. The initial
migration runs `CREATE EXTENSION IF NOT EXISTS "vector"`.

## SQL-managed indexes

Prisma schema cannot express HNSW or partial unique indexes. They are created in
`server/prisma/migrations/20260705190408_init_domain_schema/migration.sql` and re-asserted
on API boot by `server/src/db/ensure-vector-indexes.ts`:

- `Folder_workspaceId_root_name_key` — unique folder names at workspace root
- `Folder_workspaceId_parentId_name_key` — unique names among siblings
- `DocumentChunk_embedding_hnsw_idx` — cosine HNSW over `vector(1024)` embeddings
- `MemoryChunk_embedding_hnsw_idx` — same for unified memory chunks (ADR 0012)

Do not remove these in a generated migration if `prisma migrate dev` suggests dropping them;
update `ensure-vector-indexes.ts` instead and keep a no-op or restorative migration.

## Application access (no raw SQL in product modules)

Prisma’s typed client cannot assign or order by `Unsupported("vector")` columns. All **embedding
writes and similarity searches** go through the deep module:

**`server/src/db/vector.ts`**

| Function | Role |
| -------- | ---- |
| `setDocumentChunkEmbedding` / `setMemoryChunkEmbedding` | Write vector after create |
| `copyDocumentChunkEmbeddingsByPosition` | Rollback copy by position |
| `searchDocumentChunkVectors` | Current-version document RAG |
| `searchMemoryChunkVectors` | MemoryChunk search by source type |

Product code under `server/src/modules/**` must **not** call `prisma.$queryRaw` /
`$executeRaw` / `$executeRawUnsafe`. Allowed exceptions:

- `server/src/db/vector.ts` — vector DML/DQL only
- `server/src/db/ensure-vector-indexes.ts` — index DDL only
- `server/src/routes/health.ts` — `SELECT 1` readiness ping
