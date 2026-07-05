ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "useCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "rateLimitRpm" INTEGER NOT NULL DEFAULT 60;

CREATE TABLE IF NOT EXISTS "ApiKeyAuditEvent" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKeyAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ApiKeyAuditEvent_apiKeyId_createdAt_idx" ON "ApiKeyAuditEvent"("apiKeyId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ApiKeyAuditEvent" ADD CONSTRAINT "ApiKeyAuditEvent_apiKeyId_fkey"
    FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
