import type { FastifyInstance } from 'fastify';
import {
  createConversationBodySchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  sendMessageBodySchema,
  updateConversationBodySchema,
} from '@script/shared';
import { isAppError } from '../../common/errors';
import { chatMessageRateLimitConfig } from '../../config/rate-limits';
import { buildSseHeaders } from '../../lib/sse-headers';
import { requireWorkspace } from '../../plugins/auth';
import * as chat from './chat-service';

function writeEvent(reply: { raw: NodeJS.WritableStream }, payload: unknown) {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function chatRoutes(app: FastifyInstance) {
  app.get('/conversations', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const query = listConversationsQuerySchema.parse(request.query ?? {});
    return chat.listConversations(workspace.id, user.id, query);
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
    const query = listMessagesQuerySchema.parse(request.query ?? {});
    return chat.listMessages(workspace.id, user.id, conversationId, query);
  });

  app.post(
    '/conversations/:conversationId/messages/sync',
    { config: { rateLimit: chatMessageRateLimitConfig } },
    async (request) => {
      const { user, workspace } = await requireWorkspace(request);
      const { conversationId } = request.params as { conversationId: string };
      const body = sendMessageBodySchema.parse(request.body);
      let message: unknown = null;
      let content = '';
      let citations: unknown[] = [];
      for await (const event of chat.streamAssistantReply({
        workspaceId: workspace.id,
        userId: user.id,
        conversationId,
        body,
      })) {
        if (event.type === 'delta') content += event.text;
        if (event.type === 'citations') citations = event.citations;
        if (event.type === 'done') message = event.message;
        if (event.type === 'error') {
          const err = new Error(event.message) as Error & { code?: string };
          err.code = event.code;
          throw err;
        }
      }
      return {
        message: message ?? { role: 'assistant', content, citations, partial: false },
      };
    },
  );

  app.post(
    '/conversations/:conversationId/messages',
    { config: { rateLimit: chatMessageRateLimitConfig } },
    async (request, reply) => {
      const { user, workspace } = await requireWorkspace(request);
      const { conversationId } = request.params as { conversationId: string };
      const body = sendMessageBodySchema.parse(request.body);
      const controller = new AbortController();
      // Abort only when the *response* socket closes early (client disconnect).
      // request.raw 'close' fires when the request body is fully received — that
      // would abort the model stream immediately after Fastify parses the POST.
      const onResponseClose = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };

      reply.hijack();
      reply.raw.writeHead(200, buildSseHeaders(request.headers));
      reply.raw.on('close', onResponseClose);

      try {
        for await (const event of chat.streamAssistantReply({
          workspaceId: workspace.id,
          userId: user.id,
          conversationId,
          body,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break;
          writeEvent(reply, event);
        }
      } catch (error) {
        const message = isAppError(error) ? error.message : 'Chat failed';
        const code = isAppError(error) ? error.code : 'INTERNAL_SERVER_ERROR';
        if (!reply.raw.writableEnded) {
          writeEvent(reply, { type: 'error', code, message });
        }
      } finally {
        reply.raw.off('close', onResponseClose);
        if (!reply.raw.writableEnded) reply.raw.end();
      }
      return reply;
    },
  );
}
