import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import {
  CHAT_CREDIT_COST,
  CHAT_HISTORY_MESSAGE_LIMIT,
  CHAT_MAX_TOKENS,
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  RAG_MIN_SIMILARITY,
  RAG_TOP_K,
  paginate,
  refineCitationRange,
  toSkipTake,
  type CreateConversationBody,
  type ListConversationsQuery,
  type ListMessagesQuery,
  type MessageCitation,
  type SendMessageBody,
  type UpdateConversationBody,
} from '@script/shared';
import { BadRequestError, ConfigurationError, NotFoundError } from '../../common/errors';
import { env, requireAnthropicApiKey } from '../../config/env';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';
import { assertHasCredits, decrementCredits } from '../credits/credits-service';
import { searchDocumentChunkVectors } from '../../db/vector';
import { embedQuery } from '../jobs/embeddings';

import { assertLicenseAllowsWrite } from '../license/license-service';
import { formatDocumentVersionChangelog } from '../library/document-versions';
import {
  AGENT_SYSTEM_PROMPT,
  getAgentRunner,
  setAgentRunnerForTests,
  type AgentRunner,
} from './agent';

export type ChatStreamEvent =
  | { type: 'user_message'; message: ReturnType<typeof mapMessage> }
  | { type: 'citations'; citations: MessageCitation[] }
  | { type: 'tool_call'; name: string; input?: unknown; statusLabel?: string }
  | { type: 'tool_result'; name: string; ok: boolean }
  | { type: 'delta'; text: string }
  | { type: 'done'; message: ReturnType<typeof mapMessage> }
  | { type: 'error'; code: string; message: string };

export { setAgentRunnerForTests };
export type { AgentRunner };

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

function parseCitations(value: Prisma.JsonValue | null | undefined): MessageCitation[] {
  if (!value || !Array.isArray(value)) return [];
  return value as MessageCitation[];
}

function mapMessage(row: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Prisma.JsonValue | null;
  partial: boolean;
  createdAt: Date;
  mentions?: Array<{ documentId: string }>;
}) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    documentIds: row.mentions?.map((m) => m.documentId) ?? [],
    citations: parseCitations(row.citations),
    partial: row.partial,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listConversations(
  workspaceId: string,
  userId: string,
  query: ListConversationsQuery,
) {
  const where = {
    workspaceId,
    userId,
    ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    }),
  ]);
  const mapped = rows.map(mapConversation);
  const groups = new Map<string, ReturnType<typeof mapConversation>[]>();
  for (const row of rows) {
    const key = groupKey(row.updatedAt);
    const list = groups.get(key) ?? [];
    list.push(mapConversation(row));
    groups.set(key, list);
  }
  return {
    ...paginate(mapped, total, query),
    groups: [...groups.entries()].map(([group, items]) => ({ group, items })),
    conversations: mapped,
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

export async function listMessages(
  workspaceId: string,
  userId: string,
  conversationId: string,
  query: ListMessagesQuery,
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId, userId },
  });
  if (!conversation) throw new NotFoundError('Conversation');
  const { skip, take } = toSkipTake(query);
  const where = { conversationId };
  const [total, rows] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
      include: { mentions: true },
    }),
  ]);
  return paginate(
    rows.map((row) => mapMessage(row)),
    total,
    query,
  );
}

type RetrievedChunk = {
  id: string;
  content: string;
  document_id: string;
  document_version_id: string;
  name: string;
  position: number;
  start_offset: number | null;
  end_offset: number | null;
  page_number: number | null;
  score: number;
};

function documentNameMatches(content: string, name: string): boolean {
  const hay = content.toLowerCase();
  const full = name.toLowerCase().trim();
  if (!full) return false;
  if (hay.includes(full) || hay.includes(`@${full}`)) return true;
  const base = full.replace(/\.[^.]+$/, '');
  // Avoid short basenames matching common words ("api", "doc").
  if (base.length >= 5 && (hay.includes(base) || hay.includes(`@${base}`))) return true;
  return false;
}

/**
 * Merge explicit mention IDs with documents named in the user message so
 * "Tell me about AGENTS.md" scopes retrieval even without an @-chip.
 * Throws when the user clearly names only non-ready documents.
 */
async function resolveDocumentScope(
  workspaceId: string,
  content: string,
  explicitIds: string[],
): Promise<string[]> {
  const docs = await prisma.document.findMany({
    where: { workspaceId },
    select: { id: true, name: true, status: true, failureReason: true },
    orderBy: { name: 'asc' },
  });

  const byId = new Map(docs.map((d) => [d.id, d]));
  const explicit = explicitIds.filter((id) => byId.has(id));

  // Longest name first so "Service Contract Q1.doc" wins over "Contract".
  const named = [...docs]
    .sort((a, b) => b.name.length - a.name.length)
    .filter((d) => documentNameMatches(content, d.name));

  if (explicit.length === 0 && named.length > 0) {
    const readyNamed = named.filter((d) => d.status === 'ready').map((d) => d.id);
    if (readyNamed.length > 0) return [...new Set(readyNamed)];

    const blocked = named.filter((d) => d.status !== 'ready');
    const detail = blocked
      .map((d) => {
        if (d.status === 'failed') {
          return `"${d.name}" failed processing${d.failureReason ? ` (${d.failureReason.slice(0, 120)})` : ''}`;
        }
        return `"${d.name}" is still ${d.status}`;
      })
      .join('; ');
    throw new BadRequestError(
      `Named document(s) are not ready for chat: ${detail}. Open the library and use Retry on failed files.`,
      { documents: blocked.map((d) => ({ id: d.id, name: d.name, status: d.status })) },
    );
  }

  return [...new Set(explicit)];
}

async function retrieveContext(
  workspaceId: string,
  query: string,
  documentIds: string[],
  maxClearanceLevel = 0,
): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(query);
  const rows = await searchDocumentChunkVectors({
    workspaceId,
    queryEmbedding: embedding,
    limit: RAG_TOP_K,
    maxClearanceLevel,
    documentIds: documentIds.length ? documentIds : undefined,
  });

  return rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      document_id: row.document_id,
      document_version_id: row.document_version_id,
      name: row.name,
      position: row.position,
      start_offset: row.start_offset,
      end_offset: row.end_offset,
      page_number: row.page_number,
      score: Math.max(0, Math.min(1, 1 - Number(row.distance))),
    }))
    .filter((row) => row.score >= RAG_MIN_SIMILARITY);
}

function toCitations(chunks: RetrievedChunk[]): MessageCitation[] {
  return chunks.map((c) => {
    let startOffset = c.start_offset;
    let endOffset = c.end_offset;
    // Prefer a tight highlight inside the retrieved chunk (paragraph / env-var dense span).
    // `content` is aligned to [start_offset, end_offset] for newly ingested docs.
    if (
      startOffset != null &&
      endOffset != null &&
      endOffset > startOffset &&
      c.content &&
      endOffset - startOffset === c.content.length
    ) {
      const local = refineCitationRange(c.content, 0, c.content.length, null);
      startOffset = startOffset + local.startOffset;
      endOffset = startOffset + (local.endOffset - local.startOffset);
    } else if (c.content && startOffset != null) {
      const local = refineCitationRange(c.content, 0, c.content.length, null);
      startOffset = startOffset + local.startOffset;
      endOffset = startOffset + (local.endOffset - local.startOffset);
    }
    return {
      documentId: c.document_id,
      documentName: c.name,
      documentVersionId: c.document_version_id,
      chunkId: c.id,
      position: c.position,
      score: Number(c.score.toFixed(4)),
      startOffset,
      endOffset,
      pageNumber: c.page_number,
    };
  });
}

export interface CompletionStreamer {
  stream(input: {
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    signal?: AbortSignal;
  }): AsyncGenerator<string>;
}

function anthropicErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Chat completion failed';
  const err = error as {
    message?: string;
    error?: { message?: string; type?: string };
    status?: number;
  };
  const detail = err.error?.message || err.message;
  if (detail) return detail;
  return 'Chat completion failed';
}

async function* anthropicStream(input: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const apiKey = requireAnthropicApiKey();
  const client = new Anthropic({ apiKey });
  logger.info({ model: CHAT_MODEL }, 'claude completion starting');
  const stream = client.messages.stream({
    model: CHAT_MODEL,
    max_tokens: CHAT_MAX_TOKENS,
    temperature: CHAT_TEMPERATURE,
    system: input.system,
    messages: input.messages,
  });
  const onAbort = () => {
    stream.abort();
  };
  input.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for await (const event of stream) {
      if (input.signal?.aborted) break;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    if (input.signal?.aborted) return;
    const final = await stream.finalMessage();
    logger.info(
      {
        model: CHAT_MODEL,
        inputTokens: final.usage?.input_tokens,
        outputTokens: final.usage?.output_tokens,
      },
      'claude completion finished',
    );
  } catch (error) {
    if (input.signal?.aborted) return;
    logger.error({ err: error, model: CHAT_MODEL }, 'claude completion failed');
    throw new Error(anthropicErrorMessage(error));
  } finally {
    input.signal?.removeEventListener('abort', onAbort);
  }
}

const testStreamer: CompletionStreamer = {
  async *stream({ messages }) {
    const last = messages[messages.length - 1]?.content ?? '';
    yield `Test assistant reply for: ${last.slice(0, 200)}`;
  },
};

let completionStreamer: CompletionStreamer =
  env.NODE_ENV === 'test' ? testStreamer : { stream: anthropicStream };

export function setCompletionStreamerForTests(next: CompletionStreamer | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setCompletionStreamerForTests is only available in test');
  }
  completionStreamer = next ?? testStreamer;
}

export async function* streamAssistantReply(input: {
  workspaceId: string;
  userId: string;
  conversationId: string;
  body: SendMessageBody;
  signal?: AbortSignal;
  maxClearanceLevel?: number;
}): AsyncGenerator<ChatStreamEvent> {
  await assertLicenseAllowsWrite();

  if (env.NODE_ENV !== 'test' && env.COMPLETION_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new ConfigurationError(
      'ANTHROPIC_API_KEY is required for chat. Add it to server/.env (see ENV.md).',
    );
  }
  if (env.NODE_ENV !== 'test' && env.EMBEDDING_PROVIDER === 'voyage' && !env.VOYAGE_API_KEY) {
    throw new ConfigurationError(
      'VOYAGE_API_KEY is required for chat retrieval. Add it to server/.env (see ENV.md).',
    );
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, workspaceId: input.workspaceId, userId: input.userId },
  });
  if (!conversation) throw new NotFoundError('Conversation');
  await assertHasCredits(input.workspaceId, CHAT_CREDIT_COST);

  let maxClearance = input.maxClearanceLevel ?? 0;
  if (input.maxClearanceLevel === undefined) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId },
      },
    });
    maxClearance = membership?.clearanceLevel ?? 0;
  }

  const explicitIds = [...new Set(input.body.documentIds ?? [])];
  if (explicitIds.length) {
    const docs = await prisma.document.findMany({
      where: { workspaceId: input.workspaceId, id: { in: explicitIds } },
      select: { id: true, status: true, name: true },
    });
    if (docs.length !== explicitIds.length) {
      throw new BadRequestError('One or more documents are invalid');
    }
    const notReady = docs.filter((d) => d.status !== 'ready');
    if (notReady.length) {
      throw new BadRequestError('One or more mentioned documents are not ready', {
        documents: notReady.map((d) => ({ id: d.id, name: d.name, status: d.status })),
      });
    }
  }

  const documentIds = await resolveDocumentScope(
    input.workspaceId,
    input.body.content,
    explicitIds,
  );

  const userMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: input.body.content,
      mentions: {
        create: documentIds.map((documentId) => ({ documentId })),
      },
    },
    include: { mentions: true },
  });
  yield { type: 'user_message', message: mapMessage(userMessage) };

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id, id: { not: userMessage.id } },
    orderBy: { createdAt: 'desc' },
    take: CHAT_HISTORY_MESSAGE_LIMIT,
  });
  history.reverse();

  const versionChangelog = await formatDocumentVersionChangelog(
    input.workspaceId,
    documentIds,
  );

  const modelMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      modelMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const scopeHint =
    documentIds.length > 0
      ? `\n\nThe user explicitly scoped these document ids (prefer search_library with documentIds when relevant): ${documentIds.join(', ')}`
      : '';
  const changelogHint = versionChangelog ? `\n\n${versionChangelog}` : '';

  modelMessages.push({
    role: 'user',
    content: `${input.body.content}${scopeHint}${changelogHint}`,
  });

  let full = '';
  let citations: MessageCitation[] = [];
  let aborted = Boolean(input.signal?.aborted);
  const started = Date.now();

  try {
    // Prefer agent tool loop (P0/P4). Legacy completionStreamer remains for tests that inject it.
    const useLegacyStreamer =
      env.NODE_ENV === 'test' && completionStreamer !== testStreamer;

    if (useLegacyStreamer) {
      let contexts: RetrievedChunk[] = [];
      try {
        contexts = await retrieveContext(
          input.workspaceId,
          input.body.content,
          documentIds,
          maxClearance,
        );
      } catch (error) {
        await prisma.message.delete({ where: { id: userMessage.id } }).catch(() => undefined);
        throw error;
      }
      citations = toCitations(contexts);
      yield { type: 'citations', citations };
      const contextBlock = contexts
        .map((c, i) => `[${i + 1}] ${c.name} (chunk ${c.position})\n${c.content}`)
        .join('\n\n');
      for await (const text of completionStreamer.stream({
        system: AGENT_SYSTEM_PROMPT,
        messages: [
          ...modelMessages.slice(0, -1),
          {
            role: 'user',
            content: `Context:\n${contextBlock || '(no context)'}\n\nQuestion: ${input.body.content}`,
          },
        ],
        signal: input.signal,
      })) {
        if (input.signal?.aborted) {
          aborted = true;
          break;
        }
        full += text;
        yield { type: 'delta', text };
      }
    } else {
      const runner = getAgentRunner();
      for await (const event of runner({
        system: AGENT_SYSTEM_PROMPT,
        messages: modelMessages,
        toolContext: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          maxClearanceLevel: maxClearance,
        },
        signal: input.signal,
      })) {
        if (input.signal?.aborted) {
          aborted = true;
          break;
        }
        if (event.type === 'delta') {
          full += event.text;
          yield { type: 'delta', text: event.text };
        } else if (event.type === 'citations') {
          citations = event.citations;
          yield { type: 'citations', citations };
        } else if (event.type === 'tool_call') {
          yield {
            type: 'tool_call',
            name: event.name,
            input: event.input,
            statusLabel: event.statusLabel,
          };
        } else if (event.type === 'tool_result') {
          yield { type: 'tool_result', name: event.name, ok: event.ok };
        }
      }
    }
    aborted = aborted || Boolean(input.signal?.aborted);
    logger.info(
      {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        citationCount: citations.length,
        agentMs: Date.now() - started,
        aborted,
      },
      'chat agent turn complete',
    );
  } catch (error) {
    if (input.signal?.aborted) {
      aborted = true;
    } else {
      const errMessage = error instanceof Error ? error.message : 'Chat failed';
      logger.error(
        { err: error, conversationId: conversation.id, model: CHAT_MODEL },
        'assistant stream failed',
      );
      const partial = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: full || `Chat failed before a response was generated. (${errMessage})`,
          citations: citations as unknown as Prisma.InputJsonValue,
          partial: true,
        },
        include: { mentions: true },
      });
      yield {
        type: 'error',
        code: 'CHAT_FAILED',
        message: errMessage,
      };
      yield { type: 'done', message: mapMessage(partial) };
      return;
    }
  }

  const assistant = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: full || (aborted ? '' : 'No response generated.'),
      citations: citations as unknown as Prisma.InputJsonValue,
      partial: aborted,
    },
    include: { mentions: true },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: new Date(),
      title:
        conversation.title === 'New chat' ? input.body.content.slice(0, 80) : conversation.title,
    },
  });

  if (full && !aborted) {
    await decrementCredits({
      workspaceId: input.workspaceId,
      userId: input.userId,
      cost: CHAT_CREDIT_COST,
      reason: 'chat_usage',
      refType: 'message',
      refId: assistant.id,
    });
  }

  yield { type: 'done', message: mapMessage(assistant) };
}
