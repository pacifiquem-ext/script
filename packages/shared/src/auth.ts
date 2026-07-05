import { z } from 'zod';

export const signUpBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
});
export type SignUpBody = z.infer<typeof signUpBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const verifyOtpBodySchema = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(['signup_verify', 'password_reset', 'login']),
});
export type VerifyOtpBody = z.infer<typeof verifyOtpBodySchema>;

export const requestPasswordResetBodySchema = z.object({
  email: z.string().trim().email().max(320),
});
export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetBodySchema>;

export const resetPasswordBodySchema = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  emailVerifiedAt: z.string().datetime().nullable(),
  lastWorkspaceId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

export const resendOtpBodySchema = z.object({
  email: z.string().trim().email().max(320),
  purpose: z.enum(['signup_verify', 'password_reset', 'login']),
});
export type ResendOtpBody = z.infer<typeof resendOtpBodySchema>;
