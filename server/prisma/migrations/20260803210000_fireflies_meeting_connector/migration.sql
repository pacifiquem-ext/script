-- Fireflies meeting connector + unique external id

CREATE TABLE IF NOT EXISTS "MeetingConnector" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "webhookSecretHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeetingConnector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MeetingConnector_workspaceId_provider_key" ON "MeetingConnector"("workspaceId", "provider");
CREATE INDEX IF NOT EXISTS "MeetingConnector_workspaceId_idx" ON "MeetingConnector"("workspaceId");

DO $$ BEGIN
  ALTER TABLE "MeetingConnector" ADD CONSTRAINT "MeetingConnector_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unique Fireflies transcript per workspace (null external ids allowed multiple times in PG unique)
CREATE UNIQUE INDEX IF NOT EXISTS "Meeting_workspaceId_sourceProvider_sourceExternalId_key"
  ON "Meeting"("workspaceId", "sourceProvider", "sourceExternalId")
  WHERE "sourceExternalId" IS NOT NULL;
