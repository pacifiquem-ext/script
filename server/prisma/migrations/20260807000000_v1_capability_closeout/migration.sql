-- AlterTable
ALTER TABLE "MemoryChunk" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE INDEX "MemoryChunk_workspaceId_sourceType_externalId_idx" ON "MemoryChunk"("workspaceId", "sourceType", "externalId");

-- AlterTable
ALTER TABLE "MeetingCommitment" ADD COLUMN "ownerUserId" TEXT;

-- CreateIndex
CREATE INDEX "MeetingCommitment_ownerUserId_idx" ON "MeetingCommitment"("ownerUserId");

-- CreateTable
CREATE TABLE "BrowserSessionVault" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encryptedStorageState" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserSessionVault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWriteConfirmation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentWriteConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrowserSessionVault_workspaceId_userId_name_key" ON "BrowserSessionVault"("workspaceId", "userId", "name");

-- CreateIndex
CREATE INDEX "BrowserSessionVault_workspaceId_userId_idx" ON "BrowserSessionVault"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWriteConfirmation_tokenHash_key" ON "AgentWriteConfirmation"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentWriteConfirmation_workspaceId_userId_idx" ON "AgentWriteConfirmation"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "AgentWriteConfirmation_expiresAt_idx" ON "AgentWriteConfirmation"("expiresAt");

-- AddForeignKey
ALTER TABLE "BrowserSessionVault" ADD CONSTRAINT "BrowserSessionVault_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserSessionVault" ADD CONSTRAINT "BrowserSessionVault_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWriteConfirmation" ADD CONSTRAINT "AgentWriteConfirmation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWriteConfirmation" ADD CONSTRAINT "AgentWriteConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
