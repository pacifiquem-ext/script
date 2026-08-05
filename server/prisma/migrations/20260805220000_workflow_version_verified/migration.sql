-- Require agent verification of current markdown before publish

ALTER TABLE "WorkflowVersion" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "WorkflowVersion" ADD COLUMN IF NOT EXISTS "verifiedRunId" TEXT;
