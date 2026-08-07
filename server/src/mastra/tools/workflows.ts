import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import * as workflows from '../../modules/workflows/workflow-service';
import { createWriteConfirmation } from '../../modules/workflows/write-confirm';
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

const evidenceSchema = z.object({
  method: z.enum(['agent_browser', 'agent_tool', 'manual']).describe('How the step was completed'),
  summary: z.string().min(1).describe('What was done and how you verified it'),
  finalUrl: z.string().optional().describe('Page URL after the action, if browser was used'),
  actions: z.array(z.string()).optional().describe('Short list of tool actions taken'),
});

export const completeWorkflowStepTool = createTool({
  id: 'complete_workflow_step',
  description:
    'WRITE tool: mark a checklist step done after you actually performed it (browser tools or other tools). Requires runId + stepKey and evidence.summary of what you did (final URL, visible proof). Do NOT call this for steps you have not executed. Prefer method agent_browser when browser tools were used. In chat, if the result has needsConfirmation, stop and tell the user to confirm in the UI. You cannot complete the write yourself — retrying this tool will only queue another confirmation.',
  inputSchema: z.object({
    runId: z.string(),
    stepKey: z.string(),
    evidence: evidenceSchema,
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    if (!ctx.userId) {
      return { error: 'userId required to complete a workflow step' };
    }
    const role = await memberRole(ctx.workspaceId, ctx.userId);

    const runId = input.runId;
    const stepKey = input.stepKey;
    const evidence = input.evidence;

    if (!ctx.skipHitl) {
      const confirmationId = await createWriteConfirmation({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        toolName: 'complete_workflow_step',
        payload: { runId, stepKey, evidence },
      });
      return {
        ok: true,
        needsConfirmation: true,
        confirmationId,
        runId,
        stepKey,
        message: 'Waiting for the user to confirm this write in the chat UI. Do not retry.',
      };
    }

    try {
      const run = await workflows.completeStep(ctx.workspaceId, ctx.userId, runId, stepKey, {
        role,
        source: evidence.method === 'agent_browser' ? 'agent_browser' : 'agent',
        evidence,
      });
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
