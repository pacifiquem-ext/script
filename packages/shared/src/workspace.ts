import { z } from 'zod';
import { workspacePlanSchema, workspaceRoleSchema } from './enums';

export const createWorkspaceBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBodySchema>;

export const updateWorkspaceBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceBodySchema>;

export const switchWorkspaceBodySchema = z.object({
  workspaceId: z.string().min(1),
});
export type SwitchWorkspaceBody = z.infer<typeof switchWorkspaceBodySchema>;

export const inviteMemberBodySchema = z.object({
  email: z.string().trim().email().max(320),
  role: workspaceRoleSchema.exclude(['owner']).default('member'),
});
export type InviteMemberBody = z.infer<typeof inviteMemberBodySchema>;

export const updateMemberRoleBodySchema = z.object({
  role: workspaceRoleSchema.exclude(['owner']),
});
export type UpdateMemberRoleBody = z.infer<typeof updateMemberRoleBodySchema>;

export const publicWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: workspacePlanSchema,
  role: workspaceRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  creditBalance: z.number().int().nonnegative().optional(),
  memberCount: z.number().int().nonnegative().optional(),
});
export type PublicWorkspace = z.infer<typeof publicWorkspaceSchema>;

export const publicMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: workspaceRoleSchema,
  creditShare: z.number().int().min(0).max(100).nullable().optional(),
  clearanceLevel: z.number().int().min(0).max(100).default(0),
  createdAt: z.string().datetime(),
});
export type PublicMember = z.infer<typeof publicMemberSchema>;

export const updateMemberClearanceBodySchema = z.object({
  clearanceLevel: z.number().int().min(0).max(100),
});
export type UpdateMemberClearanceBody = z.infer<typeof updateMemberClearanceBodySchema>;

export const publicWorkspaceSchemaExtended = publicWorkspaceSchema.extend({
  seatsUsed: z.number().int().nonnegative().optional(),
  seatsLicensed: z.number().int().nonnegative().optional(),
});

export const SIGNUP_CREDIT_GRANT = 2000;
