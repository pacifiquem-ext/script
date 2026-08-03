import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listMeetingsQuerySchema } from '@script/shared';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import * as meetings from './meeting-service';

const connectBodySchema = z.object({
  apiKey: z.string().trim().min(16).max(512),
});

const syncBodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export async function meetingRoutes(app: FastifyInstance) {
  app.get('/meetings', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const query = listMeetingsQuerySchema.parse(request.query ?? {});
    return meetings.listMeetingsApi(workspace.id, query);
  });

  // Static paths before /meetings/:meetingId
  app.get('/meetings/connector/fireflies', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return meetings.getMeetingConnectorStatus(workspace.id);
  });

  app.post('/meetings/connector/fireflies', async (request) => {
    const { workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = connectBodySchema.parse(request.body);
    return meetings.connectFireflies(workspace.id, body.apiKey);
  });

  app.delete('/meetings/connector/fireflies', async (request) => {
    const { workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    return meetings.disconnectFireflies(workspace.id);
  });

  app.post('/meetings/connector/fireflies/sync', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = syncBodySchema.parse(request.body ?? {});
    return meetings.syncFirefliesMeetings(workspace.id, user.id, body.limit);
  });

  app.post('/meetings/connector/fireflies/import', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = z.object({ transcriptId: z.string().min(1).max(128) }).parse(request.body);
    return meetings.importFirefliesTranscript(workspace.id, user.id, body.transcriptId);
  });

  app.get('/meetings/:meetingId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { meetingId } = request.params as { meetingId: string };
    return meetings.getMeetingApi(workspace.id, meetingId);
  });

  app.delete('/meetings/:meetingId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { meetingId } = request.params as { meetingId: string };
    return meetings.deleteMeeting(workspace.id, meetingId);
  });

  app.post('/webhooks/fireflies', async (request, reply) => {
    const signature =
      (request.headers['x-hub-signature'] as string | undefined) ||
      (request.headers['X-Hub-Signature'] as string | undefined);
    const raw =
      typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    if (!meetings.verifyFirefliesWebhookSignature(raw, signature)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid signature' } });
    }
    const body = z
      .object({
        meetingId: z.string().optional(),
        clientReferenceId: z.string().optional(),
        eventType: z.string().optional(),
      })
      .parse(request.body ?? {});
    return meetings.handleFirefliesWebhook(body);
  });
}
