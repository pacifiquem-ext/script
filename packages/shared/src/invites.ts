import { z } from 'zod';
import { workspaceRoleSchema } from './enums';

export const createInviteBodySchema = z.object({
  email: z.string().trim().email().max(320),
  role: workspaceRoleSchema.exclude(['owner']).default('member'),
});
export type CreateInviteBody = z.infer<typeof createInviteBodySchema>;

export const bulkInviteBodySchema = z.object({
  emails: z.array(z.string().trim().email().max(320)).min(1).max(100),
  role: workspaceRoleSchema.exclude(['owner']).default('member'),
});
export type BulkInviteBody = z.infer<typeof bulkInviteBodySchema>;

export const acceptInviteBodySchema = z.object({
  token: z.string().min(16).max(256),
});
export type AcceptInviteBody = z.infer<typeof acceptInviteBodySchema>;

export const publicInviteSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: workspaceRoleSchema,
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
});
export type PublicInvite = z.infer<typeof publicInviteSchema>;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
