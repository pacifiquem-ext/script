import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import * as workflows from './workflow-service';

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  markdown: z.string().max(500_000).optional(),
});

const updateBodySchema = z.object({
  markdown: z.string().min(1).max(500_000),
});

const completeBodySchema = z
  .object({
    asAdmin: z.boolean().optional(),
    source: z.enum(['ui', 'agent']).optional(),
  })
  .optional()
  .default({});

export async function workflowRoutes(app: FastifyInstance) {
  app.get('/workflows', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return workflows.listWorkflows(workspace.id, workspace.role);
  });

  app.post('/workflows', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = createBodySchema.parse(request.body ?? {});
    return workflows.createWorkflow(workspace.id, user.id, body);
  });

  // Static run paths before /workflows/:id
  app.get('/workflows/runs/mine', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    return workflows.listMyRuns(workspace.id, user.id);
  });

  app.get('/workflows/runs/:runId', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { runId } = request.params as { runId: string };
    return workflows.getRun(workspace.id, user.id, runId, workspace.role);
  });

  app.post('/workflows/runs/:runId/steps/:stepKey/complete', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { runId, stepKey } = request.params as { runId: string; stepKey: string };
    const body = completeBodySchema.parse(request.body ?? {});
    return workflows.completeStep(workspace.id, user.id, runId, stepKey, {
      asAdmin: body.asAdmin,
      role: workspace.role,
      source: body.source ?? 'ui',
    });
  });

  app.get('/workflows/:id', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { id } = request.params as { id: string };
    return workflows.getWorkflow(workspace.id, id, workspace.role);
  });

  app.put('/workflows/:id', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { id } = request.params as { id: string };
    const body = updateBodySchema.parse(request.body);
    return workflows.updateDraftMarkdown(workspace.id, user.id, id, body.markdown);
  });

  app.post('/workflows/:id/publish', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { id } = request.params as { id: string };
    return workflows.publishWorkflow(workspace.id, user.id, id);
  });

  app.post('/workflows/:id/runs', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { id } = request.params as { id: string };
    return workflows.startRun(workspace.id, user.id, id);
  });
}
