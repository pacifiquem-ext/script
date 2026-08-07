import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isAppError } from '../../common/errors';
import { buildSseHeaders } from '../../lib/sse-headers';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import { executeWorkflowRun } from './agent-executor';
import * as browserVault from './browser-vault';
import * as writeConfirm from './write-confirm';
import * as workflows from './workflow-service';

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  markdown: z.string().max(500_000).optional(),
});

const updateBodySchema = z.object({
  markdown: z.string().min(1).max(500_000),
});

const evidenceSchema = z.object({
  method: z.enum(['agent_browser', 'agent_tool', 'manual', 'self_attest', 'connector']),
  summary: z.string().min(1).max(4000),
  finalUrl: z.string().max(2000).optional(),
  actions: z.array(z.string().max(500)).max(50).optional(),
});

const completeBodySchema = z
  .object({
    asAdmin: z.boolean().optional(),
    source: z.enum(['ui', 'agent', 'agent_browser']).optional(),
    evidence: evidenceSchema.optional(),
  })
  .optional()
  .default({});

const executeBodySchema = z
  .object({
    browserSessionId: z.string().min(1).optional(),
  })
  .optional()
  .default({});

const createBrowserSessionBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  storageState: z.unknown(),
});

function writeEvent(reply: { raw: NodeJS.WritableStream }, payload: unknown) {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

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

  app.get('/workflows/browser-sessions', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    return browserVault.listBrowserSessions(workspace.id, user.id);
  });

  app.post('/workflows/browser-sessions', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const body = createBrowserSessionBodySchema.parse(request.body ?? {});
    return browserVault.createBrowserSession(workspace.id, user.id, {
      name: body.name,
      storageState: body.storageState,
    });
  });

  app.delete('/workflows/browser-sessions/:id', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { id } = request.params as { id: string };
    return browserVault.deleteBrowserSession(workspace.id, user.id, id);
  });

  app.post('/workflows/write-confirmations/:confirmationId/confirm', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { confirmationId } = request.params as { confirmationId: string };
    const consumed = await writeConfirm.consumeWriteConfirmation(
      workspace.id,
      user.id,
      confirmationId,
    );
    return workflows.completeStep(
      workspace.id,
      user.id,
      consumed.payload.runId,
      consumed.payload.stepKey,
      {
        role: workspace.role,
        source:
          consumed.payload.evidence.method === 'agent_browser' ? 'agent_browser' : 'agent',
        evidence: consumed.payload.evidence,
      },
    );
  });

  app.post('/workflows/write-confirmations/:confirmationId/reject', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { confirmationId } = request.params as { confirmationId: string };
    return writeConfirm.rejectWriteConfirmation(workspace.id, user.id, confirmationId);
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

  app.post('/workflows/runs/:runId/execute', async (request, reply) => {
    const { user, workspace } = await requireWorkspace(request);
    const { runId } = request.params as { runId: string };
    const body = executeBodySchema.parse(request.body ?? {});
    const controller = new AbortController();
    const onResponseClose = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };

    reply.hijack();
    reply.raw.writeHead(200, buildSseHeaders(request.headers));
    reply.raw.on('close', onResponseClose);

    try {
      for await (const event of executeWorkflowRun({
        workspaceId: workspace.id,
        userId: user.id,
        role: workspace.role,
        runId,
        maxClearanceLevel: workspace.clearanceLevel,
        browserSessionId: body.browserSessionId,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        writeEvent(reply, event);
      }
    } catch (error) {
      const message = isAppError(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Workflow execution failed';
      const code = isAppError(error) ? error.code : 'INTERNAL_SERVER_ERROR';
      request.log.error({ err: error, runId }, 'workflow execute failed');
      if (!reply.raw.writableEnded) {
        writeEvent(reply, { type: 'error', code, message });
      }
    } finally {
      reply.raw.off('close', onResponseClose);
      if (!reply.raw.writableEnded) reply.raw.end();
    }
    return reply;
  });

  app.post('/workflows/runs/:runId/steps/:stepKey/complete', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { runId, stepKey } = request.params as { runId: string; stepKey: string };
    const body = completeBodySchema.parse(request.body ?? {});
    return workflows.completeStep(workspace.id, user.id, runId, stepKey, {
      asAdmin: body.asAdmin,
      role: workspace.role,
      source: body.source ?? 'ui',
      evidence: body.evidence,
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

  /** Polish draft + start verification run. Client streams /execute then POST .../verified. */
  app.post('/workflows/:id/verify', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { id } = request.params as { id: string };
    return workflows.prepareVerificationRun(workspace.id, user.id, id);
  });

  app.post('/workflows/:id/verified', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { id } = request.params as { id: string };
    const body = z.object({ runId: z.string().min(1) }).parse(request.body ?? {});
    return workflows.markVersionVerified(workspace.id, user.id, id, body.runId);
  });

  app.post('/workflows/:id/runs', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { id } = request.params as { id: string };
    return workflows.startRun(workspace.id, user.id, id);
  });
}
