import { z } from 'zod';

export const auditActionSchema = z.enum([
  'license.activate',
  'invite.create',
  'invite.resend',
  'invite.revoke',
  'invite.accept',
  'member.role_change',
  'member.remove',
  'member.clearance_change',
  'sso.login',
  'document.clearance_change',
  'folder.clearance_change',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const publicAuditEventSchema = z.object({
  id: z.string(),
  workspaceId: z.string().nullable(),
  actorUserId: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.unknown()),
  ip: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PublicAuditEvent = z.infer<typeof publicAuditEventSchema>;

export const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  action: z.string().optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
