import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import * as slack from './slack-service';

export async function slackRoutes(app: FastifyInstance) {
  app.get('/slack/status', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return slack.getSlackStatus(workspace.id);
  });

  app.post('/slack/install', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = z
      .object({
        botToken: z.string().min(20),
        teamId: z.string().min(1),
        teamName: z.string().optional(),
        botUserId: z.string().optional(),
      })
      .parse(request.body);
    return slack.installSlackBot(workspace.id, user.id, body);
  });

  app.delete('/slack/install', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    return slack.disconnectSlack(workspace.id, user.id);
  });

  app.post('/slack/bindings', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = z
      .object({
        channelId: z.string().min(1),
        channelName: z.string().optional(),
      })
      .parse(request.body);
    return slack.bindSlackChannel(workspace.id, user.id, body);
  });

  app.delete('/slack/bindings/:bindingId', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { bindingId } = request.params as { bindingId: string };
    return slack.unbindSlackChannel(workspace.id, user.id, bindingId);
  });

  app.post('/webhooks/slack/events', async (request, reply) => {
    const raw =
      typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const timestamp = String(request.headers['x-slack-request-timestamp'] ?? '');
    const signature = String(request.headers['x-slack-signature'] ?? '');
    try {
      const secret = slack.requireSlackSigningSecret();
      if (!slack.verifySlackSignature(secret, timestamp, raw, signature)) {
        return reply.code(401).send({ error: 'invalid signature' });
      }
    } catch {
      // Allow url_verification in local dev without secret only for challenge
      const body = request.body as { type?: string; challenge?: string };
      if (body?.type === 'url_verification' && body.challenge) {
        return { challenge: body.challenge };
      }
      return reply.code(503).send({ error: 'SLACK_SIGNING_SECRET not configured' });
    }
    const result = await slack.handleSlackEventPayload(
      request.body as Parameters<typeof slack.handleSlackEventPayload>[0],
    );
    if ('challenge' in result && result.challenge) {
      return { challenge: result.challenge };
    }
    return { ok: true };
  });
}
