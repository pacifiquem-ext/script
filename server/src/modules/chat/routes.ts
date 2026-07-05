import type { FastifyInstance } from 'fastify';
import {
  createConversationBodySchema,
  sendMessageBodySchema,
  updateConversationBodySchema,
} from '@script/shared';
import { isAppError } from '../../common/errors';
import { requireWorkspace } from '../../plugins/auth';
import * as chat from './chat-service';

export async function chatRoutes(app: FastifyInstance) {
  app.get('/conversations', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    return chat.listConversations(workspace.id, user.id);
  });

  app.post('/conversations', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    return chat.createConversation(
      workspace.id,
      user.id,
      createConversationBodySchema.parse(request.body ?? {}),
    );
  });

  app.patch('/conversations/:conversationId', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { conversationId } = request.params as { conversationId: string };
    return chat.updateConversation(
      workspace.id,
      user.id,
      conversationId,
      updateConversationBodySchema.parse(request.body),
    );
  });

  app.delete('/conversations/:conversationId', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { conversationId } = request.params as { conversationId: string };
    return chat.deleteConversation(workspace.id, user.id, conversationId);
  });

  app.get('/conversations/:conversationId/messages', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { conversationId } = request.params as { conversationId: string };
    return chat.listMessages(workspace.id, user.id, conversationId);
  });

  app.post('/conversations/:conversationId/messages/sync', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { conversationId } = request.params as { conversationId: string };
    const body = sendMessageBodySchema.parse(request.body);
    let content = '';
    for await (const chunk of chat.streamAssistantReply({
      workspaceId: workspace.id,
      userId: user.id,
      conversationId,
      body,
    })) {
      content += chunk;
    }
    return { message: { role: 'assistant', content } };
  });

  app.post('/conversations/:conversationId/messages', async (request, reply) => {
    const { user, workspace } = await requireWorkspace(request);
    const { conversationId } = request.params as { conversationId: string };
    const body = sendMessageBodySchema.parse(request.body);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    try {
      for await (const chunk of chat.streamAssistantReply({
        workspaceId: workspace.id,
        userId: user.id,
        conversationId,
        body,
      })) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
      }
      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (error) {
      const message = isAppError(error) ? error.message : 'Chat failed';
      const code = isAppError(error) ? error.code : 'INTERNAL_SERVER_ERROR';
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', code, message })}\n\n`);
    } finally {
      reply.raw.end();
    }
    return reply;
  });
}
