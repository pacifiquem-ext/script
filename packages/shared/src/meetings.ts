import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

export const createMeetingBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(20_000).optional(),
  transcriptText: z.string().trim().min(1).max(500_000),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  sourceProvider: z.string().trim().min(1).max(64).default('generic'),
  sourceExternalId: z.string().trim().max(256).optional(),
  sourceUrl: z.string().url().max(2048).optional(),
  participants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        email: z.string().email().optional(),
      }),
    )
    .max(100)
    .default([]),
  commitments: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(2000),
        ownerLabel: z.string().trim().max(200).optional(),
        dueAt: z.string().datetime().optional(),
        sourceStartMs: z.number().int().nonnegative().optional(),
      }),
    )
    .max(100)
    .optional(),
});
export type CreateMeetingBody = z.infer<typeof createMeetingBodySchema>;

export const listMeetingsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
});
export type ListMeetingsQuery = z.infer<typeof listMeetingsQuerySchema>;

export const publicMeetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  sourceProvider: z.string(),
  sourceUrl: z.string().nullable(),
  participants: z.array(
    z.object({
      name: z.string(),
      email: z.string().optional(),
    }),
  ),
  status: z.enum(['pending', 'processing', 'ready', 'failed']),
  failureReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
});
export type PublicMeeting = z.infer<typeof publicMeetingSchema>;

export const publicMeetingDetailSchema = publicMeetingSchema.extend({
  transcriptText: z.string().nullable(),
  commitments: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      ownerLabel: z.string().nullable(),
      ownerUserId: z.string().nullable().optional(),
      dueAt: z.string().datetime().nullable(),
      sourceStartMs: z.number().int().nullable(),
    }),
  ),
});
export type PublicMeetingDetail = z.infer<typeof publicMeetingDetailSchema>;
