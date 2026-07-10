-- CreateEnum
CREATE TYPE "DocumentVersionChangeReason" AS ENUM ('upload', 'reprocess', 'rollback', 'backfill', 'import');

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "processingPhase" TEXT,
    "failureReason" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentHash" TEXT,
    "extractedText" TEXT,
    "pageCount" INTEGER,
    "embeddingModel" TEXT,
    "embeddingDimensions" INTEGER,
    "changeReason" "DocumentVersionChangeReason" NOT NULL,
    "restoredFromVersionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- AlterTable Document
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "currentVersionId" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "processingVersionId" TEXT;

-- AlterTable DocumentChunk: add version id (nullable until backfill)
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "documentVersionId" TEXT;

-- Backfill: one version per existing document from current columns
INSERT INTO "DocumentVersion" (
  "id", "documentId", "workspaceId", "versionNumber", "status", "processingPhase",
  "failureReason", "mimeType", "byteSize", "storageKey", "contentHash", "extractedText",
  "pageCount", "embeddingModel", "embeddingDimensions", "changeReason", "createdById",
  "createdAt", "processedAt", "supersededAt"
)
SELECT
  'mig_' || d."id",
  d."id",
  d."workspaceId",
  1,
  d."status",
  d."processingPhase",
  d."failureReason",
  d."mimeType",
  d."byteSize",
  d."storageKey",
  NULL,
  d."extractedText",
  d."pageCount",
  d."embeddingModel",
  d."embeddingDimensions",
  CASE
    WHEN d."source" = 'local' THEN 'upload'::"DocumentVersionChangeReason"
    WHEN d."source" = 'url' THEN 'import'::"DocumentVersionChangeReason"
    ELSE 'import'::"DocumentVersionChangeReason"
  END,
  d."createdById",
  d."createdAt",
  d."processedAt",
  NULL
FROM "Document" d
WHERE NOT EXISTS (
  SELECT 1 FROM "DocumentVersion" v WHERE v."documentId" = d."id"
);

-- Point document current/processing at the migrated version
UPDATE "Document" d
SET
  "currentVersionId" = CASE WHEN d."status" = 'ready' THEN 'mig_' || d."id" ELSE NULL END,
  "processingVersionId" = CASE
    WHEN d."status" IN ('pending', 'processing') THEN 'mig_' || d."id"
    ELSE NULL
  END
WHERE d."currentVersionId" IS NULL AND d."processingVersionId" IS NULL;

-- Attach existing chunks to migrated version
UPDATE "DocumentChunk" c
SET "documentVersionId" = 'mig_' || c."documentId"
WHERE c."documentVersionId" IS NULL;

-- Drop old unique on (documentId, position) — chunks are unique per version now
DROP INDEX IF EXISTS "DocumentChunk_documentId_position_key";

-- Enforce version id on chunks (any orphan without a version is invalid after backfill)
DELETE FROM "DocumentChunk" WHERE "documentVersionId" IS NULL;
ALTER TABLE "DocumentChunk" ALTER COLUMN "documentVersionId" SET NOT NULL;

-- Indexes / FKs for DocumentVersion
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");
CREATE INDEX "DocumentVersion_workspaceId_contentHash_idx" ON "DocumentVersion"("workspaceId", "contentHash");
CREATE INDEX "DocumentVersion_documentId_status_idx" ON "DocumentVersion"("documentId", "status");
CREATE INDEX "DocumentVersion_workspaceId_documentId_idx" ON "DocumentVersion"("workspaceId", "documentId");

ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_restoredFromVersionId_fkey"
  FOREIGN KEY ("restoredFromVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Document pointers
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "Document"("currentVersionId");
CREATE UNIQUE INDEX "Document_processingVersionId_key" ON "Document"("processingVersionId");
CREATE INDEX "Document_workspaceId_contentHash_idx" ON "Document"("workspaceId", "contentHash");

ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVersionId_fkey"
  FOREIGN KEY ("currentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_processingVersionId_fkey"
  FOREIGN KEY ("processingVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DocumentChunk version FK + unique
CREATE UNIQUE INDEX "DocumentChunk_documentVersionId_position_key" ON "DocumentChunk"("documentVersionId", "position");
CREATE INDEX "DocumentChunk_documentVersionId_idx" ON "DocumentChunk"("documentVersionId");
CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentVersionId_fkey"
  FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
