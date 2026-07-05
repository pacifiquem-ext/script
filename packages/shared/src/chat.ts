import { z } from 'zod';
import { messageRoleSchema } from './enums';

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
  createdAt: z.string().datetime(),
});
export type PublicMessage = z.infer<typeof publicMessageSchema>;

export const CHAT_CREDIT_COST = 1;
export const INGESTION_CREDIT_COST = 1;
