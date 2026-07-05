import { z } from 'zod';
import { documentSourceSchema, documentStatusSchema } from './enums';
import { paginationQuerySchema } from './pagination';

export const createFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().min(1).nullable().optional(),
});
export type CreateFolderBody = z.infer<typeof createFolderBodySchema>;

export const updateFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().min(1).nullable().optional(),
});
export type UpdateFolderBody = z.infer<typeof updateFolderBodySchema>;

export const updateDocumentBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().min(1).nullable().optional(),
});
export type UpdateDocumentBody = z.infer<typeof updateDocumentBodySchema>;

export const listDocumentsQuerySchema = paginationQuerySchema.extend({
  folderId: z.string().min(1).nullable().optional(),
  q: z.string().trim().max(200).optional(),
  status: documentStatusSchema.optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const importUrlBodySchema = z.object({
  url: z.string().url().max(2048),
  folderId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(255).optional(),
});
export type ImportUrlBody = z.infer<typeof importUrlBodySchema>;

export const publicFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  documentCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PublicFolder = z.infer<typeof publicFolderSchema>;

export const publicDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  folderId: z.string().nullable(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  source: documentSourceSchema,
  sourceUrl: z.string().nullable(),
  status: documentStatusSchema,
  failureReason: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  downloadUrl: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
});
export type PublicDocument = z.infer<typeof publicDocumentSchema>;

export const publicDocumentDetailSchema = publicDocumentSchema.extend({
  extractedText: z.string().nullable(),
});
export type PublicDocumentDetail = z.infer<typeof publicDocumentDetailSchema>;
