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

Do not remove these in a generated migration if `prisma migrate dev` suggests dropping them;
update `ensure-vector-indexes.ts` instead and keep a no-op or restorative migration.
