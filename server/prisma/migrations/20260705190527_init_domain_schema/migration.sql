-- Prisma cannot represent HNSW / partial unique indexes in schema.prisma; they are
-- created in 20260705190408_init_domain_schema and re-asserted by ensureVectorIndexes()
-- on server boot. This migration intentionally keeps schema drift from removing them.
SELECT 1;
