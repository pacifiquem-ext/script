import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import * as workflows from '../../modules/workflows/workflow-service';
import { toolContextFromRequestContext } from '../request-context';

async function memberRole(workspaceId: string, userId: string | undefined) {
  if (!userId) return 'member' as const;
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m?.role ?? ('member' as const);
}

export const listWorkflowsTool = createTool({
  id: 'list_workflows',
  description:
    'List guided process workflows in this workspace (name, status, step count). Use for "what onboarding workflows exist?", process inventory. Members only see published workflows.',
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    const role = await memberRole(ctx.workspaceId, ctx.userId);
    return workflows.listWorkflows(ctx.workspaceId, role);
  },
});

export const getWorkflowTool = createTool({
  id: 'get_workflow',
  description:
    'Get one workflow’s steps and section outline by id. Use when the user asks how a guided process works or what steps it contains.',
  inputSchema: z.object({
    workflowId: z.string().describe('Workflow id from list_workflows'),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    const role = await memberRole(ctx.workspaceId, ctx.userId);
    try {
      const detail = await workflows.getWorkflow(ctx.workspaceId, input.workflowId, role);
      return {
        id: detail.id,
        name: detail.name,
        status: detail.status,
        steps: detail.version?.steps ?? [],
        sections: detail.version?.sections ?? [],
        markdownPreview: detail.version?.markdown?.slice(0, 4000) ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workflow not found';
      return { error: message };
    }
  },
});

export const getMyWorkflowProgressTool = createTool({
  id: 'get_my_workflow_progress',
  description:
    'Get the current user’s in-progress workflow runs, step statuses, and what’s next. Use for "what should I do next?", onboarding progress, remaining checklist items.',
  inputSchema: z.object({
    workflowId: z.string().optional().describe('Optional filter to one workflow id'),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    if (!ctx.userId) {
      return { error: 'userId required for workflow progress', runs: [], nextSteps: [] };
    }
    return workflows.getMyProgress(ctx.workspaceId, ctx.userId, input.workflowId);
  },
});

export const completeWorkflowStepTool = createTool({
  id: 'complete_workflow_step',
  description:
    'WRITE tool: mark a checklist step done on the current user’s run. ONLY call when the user explicitly asks to mark a step complete (e.g. "mark laptop setup done"). Requires runId + stepKey from get_my_workflow_progress. Self-attestation only — do not invent completion.',
  inputSchema: z.object({
    runId: z.string(),
    stepKey: z.string(),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    if (!ctx.userId) {
      return { error: 'userId required to complete a workflow step' };
    }
    const role = await memberRole(ctx.workspaceId, ctx.userId);
    try {
      const run = await workflows.completeStep(
        ctx.workspaceId,
        ctx.userId,
        input.runId,
        input.stepKey,
        { role, source: 'agent' },
      );
      return {
        ok: true,
        runId: run.id,
        status: run.status,
        progress: run.progress,
        steps: run.steps,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete step';
      return { error: message };
    }
  },
});
