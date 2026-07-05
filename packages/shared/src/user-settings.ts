import { z } from 'zod';

export const updateProfileBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

export const userPreferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  locale: z.string().min(2).max(16).default('en'),
  aiTone: z.enum(['default', 'concise', 'detailed']).default('default'),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const updatePreferencesBodySchema = userPreferencesSchema.partial();
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesBodySchema>;

export const updateMemberCreditShareBodySchema = z.object({
  creditShare: z.number().int().min(0).max(100).nullable(),
});
export type UpdateMemberCreditShareBody = z.infer<typeof updateMemberCreditShareBodySchema>;

export const publicSessionSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  current: z.boolean(),
});
export type PublicSession = z.infer<typeof publicSessionSchema>;

export const creditBalanceSchema = z.object({
  balance: z.number().int(),
  plan: z.enum(['free', 'pro', 'team']),
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

export const deleteAccountBodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});
export type DeleteAccountBody = z.infer<typeof deleteAccountBodySchema>;
