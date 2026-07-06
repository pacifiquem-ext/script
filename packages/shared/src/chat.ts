import { z } from 'zod';
import {
  CHAT_CREDIT_COST,
  CHAT_HISTORY_MESSAGE_LIMIT,
  CHAT_MAX_TOKENS,
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  INGESTION_CREDIT_COST,
  RAG_MIN_SIMILARITY,
  RAG_TOP_K,
} from './constants';
import { messageRoleSchema } from './enums';
import { paginationQuerySchema } from './pagination';

export { CHAT_CREDIT_COST, INGESTION_CREDIT_COST };

export const createConversationBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});
export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;

export const updateConversationBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type UpdateConversationBody = z.infer<typeof updateConversationBodySchema>;

export const sendMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(20000),
  documentIds: z.array(z.string().min(1)).max(20).default([]),
});
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export const listConversationsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const listMessagesQuerySchema = paginationQuerySchema;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const messageCitationSchema = z.object({
  documentId: z.string(),
  documentName: z.string(),
  chunkId: z.string(),
  position: z.number().int().nonnegative(),
  score: z.number().min(0).max(1).optional(),
  startOffset: z.number().int().nonnegative().nullable().optional(),
  endOffset: z.number().int().nonnegative().nullable().optional(),
  pageNumber: z.number().int().positive().nullable().optional(),
});
export type MessageCitation = z.infer<typeof messageCitationSchema>;

export const publicConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PublicConversation = z.infer<typeof publicConversationSchema>;

export const publicMessageSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  documentIds: z.array(z.string()),
  citations: z.array(messageCitationSchema),
  partial: z.boolean(),
  createdAt: z.string().datetime(),
});
export type PublicMessage = z.infer<typeof publicMessageSchema>;

export const chatModelConfig = {
  model: CHAT_MODEL,
  maxTokens: CHAT_MAX_TOKENS,
  temperature: CHAT_TEMPERATURE,
  historyLimit: CHAT_HISTORY_MESSAGE_LIMIT,
  topK: RAG_TOP_K,
  minSimilarity: RAG_MIN_SIMILARITY,
} as const;
