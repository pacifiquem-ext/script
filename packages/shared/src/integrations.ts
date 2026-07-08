import { z } from 'zod';
import { integrationProviderSchema, integrationStatusSchema } from './enums';

export const publicIntegrationSchema = z.object({
  id: z.string(),
  provider: integrationProviderSchema,
  accountEmail: z.string().nullable(),
  status: integrationStatusSchema,
  statusMessage: z.string().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PublicIntegration = z.infer<typeof publicIntegrationSchema>;

export const integrationProviderStatusSchema = z.object({
  provider: integrationProviderSchema,
  configured: z.boolean(),
  connected: z.boolean(),
  integration: publicIntegrationSchema.nullable(),
});
export type IntegrationProviderStatus = z.infer<typeof integrationProviderStatusSchema>;

export const listIntegrationsResponseSchema = z.object({
  providers: z.array(integrationProviderStatusSchema),
});
export type ListIntegrationsResponse = z.infer<typeof listIntegrationsResponseSchema>;

export const connectIntegrationResponseSchema = z.object({
  url: z.string().url(),
  provider: integrationProviderSchema,
});
export type ConnectIntegrationResponse = z.infer<typeof connectIntegrationResponseSchema>;

export const cloudFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().nullable(),
  isFolder: z.boolean(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: z.string().datetime().nullable(),
});
export type CloudFile = z.infer<typeof cloudFileSchema>;

export const listCloudFilesQuerySchema = z.object({
  parentId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
});
export type ListCloudFilesQuery = z.infer<typeof listCloudFilesQuerySchema>;

export const listCloudFilesResponseSchema = z.object({
  files: z.array(cloudFileSchema),
  nextCursor: z.string().nullable(),
  parentId: z.string().nullable(),
});
export type ListCloudFilesResponse = z.infer<typeof listCloudFilesResponseSchema>;

export const importCloudFilesBodySchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1).max(50),
  folderId: z.string().min(1).nullable().optional(),
});
export type ImportCloudFilesBody = z.infer<typeof importCloudFilesBodySchema>;

export const importCloudFilesResponseSchema = z.object({
  imported: z.number().int().nonnegative(),
  documents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
    }),
  ),
  failed: z.array(z.object({ fileId: z.string(), name: z.string().optional(), error: z.string() })),
});
export type ImportCloudFilesResponse = z.infer<typeof importCloudFilesResponseSchema>;
