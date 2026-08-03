-- Phase 1–3: tool audit, memory sources/chunks, meetings

CREATE TYPE "MemorySourceType" AS ENUM ('document', 'meeting');
CREATE TYPE "MeetingStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

CREATE TABLE "MemorySource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "MemorySourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "documentId" TEXT,
    "meetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemorySource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemorySource_documentId_key" ON "MemorySource"("documentId");
CREATE UNIQUE INDEX "MemorySource_meetingId_key" ON "MemorySource"("meetingId");
CREATE INDEX "MemorySource_workspaceId_type_idx" ON "MemorySource"("workspaceId", "type");

CREATE TABLE "MemoryChunk" (
    "id" TEXT NOT NULL,
    "memorySourceId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" "MemorySourceType" NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "documentId" TEXT,
    "documentVersionId" TEXT,
    "meetingId" TEXT,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "pageNumber" INTEGER,
    "speaker" TEXT,
    "startMs" INTEGER,
    "endMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoryChunk_memorySourceId_position_key" ON "MemoryChunk"("memorySourceId", "position");
CREATE INDEX "MemoryChunk_workspaceId_sourceType_idx" ON "MemoryChunk"("workspaceId", "sourceType");
CREATE INDEX "MemoryChunk_documentId_idx" ON "MemoryChunk"("documentId");
CREATE INDEX "MemoryChunk_documentVersionId_idx" ON "MemoryChunk"("documentVersionId");
CREATE INDEX "MemoryChunk_meetingId_idx" ON "MemoryChunk"("meetingId");

CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "transcriptText" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "sourceProvider" TEXT NOT NULL DEFAULT 'generic',
    "sourceExternalId" TEXT,
    "sourceUrl" TEXT,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "status" "MeetingStatus" NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Meeting_workspaceId_startedAt_idx" ON "Meeting"("workspaceId", "startedAt");
CREATE INDEX "Meeting_workspaceId_status_idx" ON "Meeting"("workspaceId", "status");
CREATE INDEX "Meeting_workspaceId_sourceProvider_sourceExternalId_idx" ON "Meeting"("workspaceId", "sourceProvider", "sourceExternalId");

CREATE TABLE "MeetingCommitment" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ownerLabel" TEXT,
    "dueAt" TIMESTAMP(3),
    "sourceStartMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingCommitment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingCommitment_workspaceId_meetingId_idx" ON "MeetingCommitment"("workspaceId", "meetingId");
CREATE INDEX "MeetingCommitment_meetingId_idx" ON "MeetingCommitment"("meetingId");

CREATE TABLE "AgentToolCall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "tool" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentToolCall_workspaceId_createdAt_idx" ON "AgentToolCall"("workspaceId", "createdAt");
CREATE INDEX "AgentToolCall_tool_createdAt_idx" ON "AgentToolCall"("tool", "createdAt");
CREATE INDEX "AgentToolCall_userId_createdAt_idx" ON "AgentToolCall"("userId", "createdAt");

ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_memorySourceId_fkey" FOREIGN KEY ("memorySourceId") REFERENCES "MemorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetingCommitment" ADD CONSTRAINT "MeetingCommitment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingCommitment" ADD CONSTRAINT "MeetingCommitment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial HNSW for MemoryChunk (same pattern as DocumentChunk; ensure-vector-indexes may recreate)
CREATE INDEX IF NOT EXISTS "MemoryChunk_embedding_hnsw_idx"
  ON "MemoryChunk" USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
