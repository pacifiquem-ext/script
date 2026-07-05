import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import {
  CHAT_CREDIT_COST,
  type CreateConversationBody,
  type SendMessageBody,
  type UpdateConversationBody,
} from '@script/shared';
import { BadRequestError, NotFoundError } from '../../common/errors';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { assertHasCredits, decrementCredits } from '../credits/credits-service';
import { embedQuery, vectorLiteral } from '../jobs/embeddings';

function groupKey(date: Date): string {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (startToday.getTime() - startThat.getTime()) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return startThat.toLocaleDateString();
}

function mapConversation(row: { id: string; title: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listConversations(workspaceId: string, userId: string) {
  const rows = await prisma.conversation.findMany({
    where: { workspaceId, userId },
    orderBy: { updatedAt: 'desc' },
  });
  const groups = new Map<string, ReturnType<typeof mapConversation>[]>();
  for (const row of rows) {
    const key = groupKey(row.updatedAt);
    const list = groups.get(key) ?? [];
    list.push(mapConversation(row));
    groups.set(key, list);
  }
  return {
    groups: [...groups.entries()].map(([group, items]) => ({ group, items })),
    conversations: rows.map(mapConversation),
  };
}

export async function createConversation(
  workspaceId: string,
  userId: string,
  body: CreateConversationBody,
) {
  const row = await prisma.conversation.create({
    data: { workspaceId, userId, title: body.title?.trim() || 'New chat' },
  });
  return { conversation: mapConversation(row) };
}

export async function updateConversation(
  workspaceId: string,
  userId: string,
  conversationId: string,
  body: UpdateConversationBody,
) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId, userId },
  });
  if (!existing) throw new NotFoundError('Conversation');
  const row = await prisma.conversation.update({
    where: { id: conversationId },
    data: { title: body.title },
  });
  return { conversation: mapConversation(row) };
}

export async function deleteConversation(
  workspaceId: string,
  userId: string,
  conversationId: string,
) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId, userId },
  });
  if (!existing) throw new NotFoundError('Conversation');
  await prisma.conversation.delete({ where: { id: conversationId } });
  return { ok: true as const };
}

export async function listMessages(workspaceId: string, userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId, userId },
  });
  if (!conversation) throw new NotFoundError('Conversation');
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    include: { mentions: true },
  });
  return {
    messages: rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      documentIds: row.mentions.map((m) => m.documentId),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

async function retrieveContext(workspaceId: string, query: string, documentIds: string[]) {
  const embedding = await embedQuery(query);
  const vector = vectorLiteral(embedding);
  if (documentIds.length > 0) {
    return prisma.$queryRaw<Array<{ content: string; document_id: string; name: string }>>`
      SELECT c.content, c."documentId" as document_id, d.name
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE c."workspaceId" = ${workspaceId}
        AND d.status = 'ready'
        AND c.embedding IS NOT NULL
        AND d.id IN (${Prisma.join(documentIds)})
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT 8
    `;
  }
  return prisma.$queryRaw<Array<{ content: string; document_id: string; name: string }>>`
    SELECT c.content, c."documentId" as document_id, d.name
    FROM "DocumentChunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE c."workspaceId" = ${workspaceId}
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT 8
  `;
}

export async function* streamAssistantReply(input: {
  workspaceId: string;
  userId: string;
  conversationId: string;
  body: SendMessageBody;
}): AsyncGenerator<string> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, workspaceId: input.workspaceId, userId: input.userId },
  });
  if (!conversation) throw new NotFoundError('Conversation');
  await assertHasCredits(input.workspaceId, CHAT_CREDIT_COST);

  const documentIds = input.body.documentIds ?? [];
  if (documentIds.length) {
    const count = await prisma.document.count({
      where: { workspaceId: input.workspaceId, id: { in: documentIds } },
    });
    if (count !== documentIds.length)
      throw new BadRequestError('One or more documents are invalid');
  }

  const userMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: input.body.content,
      mentions: {
        create: documentIds.map((documentId) => ({ documentId })),
      },
    },
  });

  const contexts = await retrieveContext(input.workspaceId, input.body.content, documentIds);
  const contextBlock = contexts.map((c, i) => `[${i + 1}] ${c.name}\n${c.content}`).join('\n\n');

  let full = '';
  if (!env.ANTHROPIC_API_KEY) {
    full = contexts.length
      ? `I found ${contexts.length} relevant chunk(s). ${contexts[0]?.content.slice(0, 500) ?? ''}`
      : 'No indexed documents are ready yet. Upload and wait for processing, then ask again.';
    yield full;
  } else {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system:
        'You are script, an AI assistant for workspace documents. Use only the provided context chunks. If context is insufficient, say so.',
      messages: [
        {
          role: 'user',
          content: `Context:\n${contextBlock || '(no context)'}\n\nQuestion: ${input.body.content}`,
        },
      ],
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text;
        yield event.delta.text;
      }
    }
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, role: 'assistant', content: full },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: new Date(),
      title:
        conversation.title === 'New chat' ? input.body.content.slice(0, 80) : conversation.title,
    },
  });
  await decrementCredits({
    workspaceId: input.workspaceId,
    userId: input.userId,
    cost: CHAT_CREDIT_COST,
    reason: 'chat_usage',
    refType: 'message',
    refId: userMessage.id,
  });
}
