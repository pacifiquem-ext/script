import { prisma } from './prisma';
import { logger } from '../lib/logger';

const statements = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "Folder_workspaceId_root_name_key" ON "Folder"("workspaceId", "name") WHERE "parentId" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Folder_workspaceId_parentId_name_key" ON "Folder"("workspaceId", "parentId", "name") WHERE "parentId" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops)`,
];

export async function ensureVectorIndexes(): Promise<void> {
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (error) {
      logger.warn({ err: error, sql }, 'failed to ensure SQL-managed index');
    }
  }
}
