-- AlterEnum
ALTER TYPE "CreditLedgerReason" ADD VALUE IF NOT EXISTS 'embedding_backfill';

-- AlterTable Document
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "processingPhase" TEXT;

-- AlterTable DocumentChunk
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "startOffset" INTEGER;
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "endOffset" INTEGER;
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "pageNumber" INTEGER;

-- AlterTable Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "citations" JSONB;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "partial" BOOLEAN NOT NULL DEFAULT false;

-- Idempotent usage charges: one ledger row per (workspace, reason, refType, refId) when ref set
CREATE UNIQUE INDEX IF NOT EXISTS "CreditLedgerEntry_usage_idempotency_uidx"
ON "CreditLedgerEntry" ("workspaceId", "reason", "refType", "refId")
WHERE "refType" IS NOT NULL AND "refId" IS NOT NULL AND "delta" < 0;
