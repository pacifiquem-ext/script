-- Phases 4–6: clearance, identity, system connectors, GitHub work, Slack

ALTER TYPE "MemorySourceType" ADD VALUE IF NOT EXISTS 'channel';
ALTER TYPE "MemorySourceType" ADD VALUE IF NOT EXISTS 'work_item';

CREATE TYPE "ResourceVisibility" AS ENUM ('workspace', 'restricted');
CREATE TYPE "ResourceKind" AS ENUM ('document', 'meeting', 'channel', 'work_item', 'work_project');

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "visibility" "ResourceVisibility" NOT NULL DEFAULT 'workspace';
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "clearanceLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "visibility" "ResourceVisibility" NOT NULL DEFAULT 'workspace';

ALTER TABLE "MemorySource" ADD COLUMN IF NOT EXISTS "externalKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "MemorySource_workspaceId_type_externalKey_key"
  ON "MemorySource"("workspaceId", "type", "externalKey")
  WHERE "externalKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "ResourcePrincipal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resourceKind" "ResourceKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourcePrincipal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ResourcePrincipal_workspaceId_resourceKind_resourceId_userId_key"
  ON "ResourcePrincipal"("workspaceId", "resourceKind", "resourceId", "userId");
CREATE INDEX IF NOT EXISTS "ResourcePrincipal_workspaceId_userId_idx" ON "ResourcePrincipal"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "ResourcePrincipal_resourceKind_resourceId_idx" ON "ResourcePrincipal"("resourceKind", "resourceId");
ALTER TABLE "ResourcePrincipal" DROP CONSTRAINT IF EXISTS "ResourcePrincipal_workspaceId_fkey";
ALTER TABLE "ResourcePrincipal" ADD CONSTRAINT "ResourcePrincipal_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PersonIdentity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PersonIdentity_workspaceId_provider_externalId_key"
  ON "PersonIdentity"("workspaceId", "provider", "externalId");
CREATE INDEX IF NOT EXISTS "PersonIdentity_workspaceId_email_idx" ON "PersonIdentity"("workspaceId", "email");
CREATE INDEX IF NOT EXISTS "PersonIdentity_workspaceId_userId_idx" ON "PersonIdentity"("workspaceId", "userId");
ALTER TABLE "PersonIdentity" DROP CONSTRAINT IF EXISTS "PersonIdentity_workspaceId_fkey";
ALTER TABLE "PersonIdentity" ADD CONSTRAINT "PersonIdentity_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SystemConnector" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'connected',
    "consentAt" TIMESTAMP(3),
    "installedById" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemConnector_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemConnector_workspaceId_provider_key" ON "SystemConnector"("workspaceId", "provider");
CREATE INDEX IF NOT EXISTS "SystemConnector_workspaceId_idx" ON "SystemConnector"("workspaceId");
ALTER TABLE "SystemConnector" DROP CONSTRAINT IF EXISTS "SystemConnector_workspaceId_fkey";
ALTER TABLE "SystemConnector" ADD CONSTRAINT "SystemConnector_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "WorkProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "clearanceLevel" INTEGER NOT NULL DEFAULT 0,
    "visibility" "ResourceVisibility" NOT NULL DEFAULT 'workspace',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkProject_connectorId_externalId_key" ON "WorkProject"("connectorId", "externalId");
CREATE INDEX IF NOT EXISTS "WorkProject_workspaceId_idx" ON "WorkProject"("workspaceId");
ALTER TABLE "WorkProject" DROP CONSTRAINT IF EXISTS "WorkProject_workspaceId_fkey";
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkProject" DROP CONSTRAINT IF EXISTS "WorkProject_connectorId_fkey";
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_connectorId_fkey"
  FOREIGN KEY ("connectorId") REFERENCES "SystemConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "WorkItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "state" TEXT NOT NULL DEFAULT 'open',
    "assigneeExternalId" TEXT,
    "assigneeUserId" TEXT,
    "url" TEXT,
    "clearanceLevel" INTEGER NOT NULL DEFAULT 0,
    "visibility" "ResourceVisibility" NOT NULL DEFAULT 'workspace',
    "externalUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkItem_workspaceId_externalId_key" ON "WorkItem"("workspaceId", "externalId");
CREATE INDEX IF NOT EXISTS "WorkItem_workspaceId_state_idx" ON "WorkItem"("workspaceId", "state");
CREATE INDEX IF NOT EXISTS "WorkItem_projectId_idx" ON "WorkItem"("projectId");
CREATE INDEX IF NOT EXISTS "WorkItem_assigneeUserId_idx" ON "WorkItem"("assigneeUserId");
ALTER TABLE "WorkItem" DROP CONSTRAINT IF EXISTS "WorkItem_workspaceId_fkey";
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkItem" DROP CONSTRAINT IF EXISTS "WorkItem_projectId_fkey";
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SlackInstall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "encryptedBotToken" TEXT NOT NULL,
    "botUserId" TEXT,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "installedById" TEXT,
    "consentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'connected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SlackInstall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SlackInstall_workspaceId_key" ON "SlackInstall"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "SlackInstall_teamId_key" ON "SlackInstall"("teamId");
ALTER TABLE "SlackInstall" DROP CONSTRAINT IF EXISTS "SlackInstall_workspaceId_fkey";
ALTER TABLE "SlackInstall" ADD CONSTRAINT "SlackInstall_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ChannelBinding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slackInstallId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT,
    "boundByUserId" TEXT,
    "retentionDays" INTEGER,
    "announcedAt" TIMESTAMP(3),
    "clearanceLevel" INTEGER NOT NULL DEFAULT 0,
    "visibility" "ResourceVisibility" NOT NULL DEFAULT 'workspace',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelBinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChannelBinding_slackInstallId_channelId_key" ON "ChannelBinding"("slackInstallId", "channelId");
CREATE INDEX IF NOT EXISTS "ChannelBinding_workspaceId_idx" ON "ChannelBinding"("workspaceId");
ALTER TABLE "ChannelBinding" DROP CONSTRAINT IF EXISTS "ChannelBinding_workspaceId_fkey";
ALTER TABLE "ChannelBinding" ADD CONSTRAINT "ChannelBinding_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelBinding" DROP CONSTRAINT IF EXISTS "ChannelBinding_slackInstallId_fkey";
ALTER TABLE "ChannelBinding" ADD CONSTRAINT "ChannelBinding_slackInstallId_fkey"
  FOREIGN KEY ("slackInstallId") REFERENCES "SlackInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
