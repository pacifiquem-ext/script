import { z } from 'zod';
import {
  documentProcessingPhaseSchema,
  documentSourceSchema,
  documentStatusSchema,
  documentVersionChangeReasonSchema,
} from './enums';
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
  processingPhase: documentProcessingPhaseSchema.nullable(),
  failureReason: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  /** One-line inventory blurb for library intelligence / agent list tools. */
  summary: z.string().nullable().optional(),
  downloadUrl: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
  currentVersionId: z.string().nullable(),
  currentVersionNumber: z.number().int().positive().nullable(),
  /** True while a non-current version is pending/processing (current ready version stays retrievable). */
  isUpdating: z.boolean(),
});
export type PublicDocument = z.infer<typeof publicDocumentSchema>;

export const publicDocumentDetailSchema = publicDocumentSchema.extend({
  extractedText: z.string().nullable(),
  /** Present when detail is loaded for a historical version (citation preview / version viewer). */
  versionId: z.string().nullable().optional(),
  versionNumber: z.number().int().positive().nullable().optional(),
});
export type PublicDocumentDetail = z.infer<typeof publicDocumentDetailSchema>;

export const publicDocumentVersionSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  versionNumber: z.number().int().positive(),
  status: documentStatusSchema,
  processingPhase: documentProcessingPhaseSchema.nullable(),
  failureReason: z.string().nullable(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  contentHash: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  changeReason: documentVersionChangeReasonSchema,
  restoredFromVersionId: z.string().nullable(),
  isCurrent: z.boolean(),
  createdById: z.string().nullable().optional(),
  createdByName: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
  supersededAt: z.string().datetime().nullable(),
});
export type PublicDocumentVersion = z.infer<typeof publicDocumentVersionSchema>;

export const publicDocumentVersionDetailSchema = publicDocumentVersionSchema.extend({
  extractedText: z.string().nullable(),
  downloadUrl: z.string().nullable().optional(),
});
export type PublicDocumentVersionDetail = z.infer<typeof publicDocumentVersionDetailSchema>;
