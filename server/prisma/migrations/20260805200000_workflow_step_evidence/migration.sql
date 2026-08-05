-- Workflow step completion evidence (agent browser / manual / connector)

ALTER TABLE "WorkflowStepState" ADD COLUMN IF NOT EXISTS "evidenceJson" JSONB;
