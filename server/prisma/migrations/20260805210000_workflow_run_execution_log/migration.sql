-- Persist agent execution activity so in-progress runs show logs/reasoning after refresh.

ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "agentStatus" TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "agentSummary" TEXT;
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "executionLogJson" JSONB;
