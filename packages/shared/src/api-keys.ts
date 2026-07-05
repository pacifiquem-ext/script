import { z } from 'zod';

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;

export const publicApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  lastUsedAt: z.string().datetime().nullable(),
  useCount: z.number().int().nonnegative(),
  rateLimitRpm: z.number().int().positive(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type PublicApiKey = z.infer<typeof publicApiKeySchema>;
