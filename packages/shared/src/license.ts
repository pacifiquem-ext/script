import { z } from 'zod';

export const licensePhaseSchema = z.enum(['active', 'grace', 'read_only', 'locked']);
export type LicensePhase = z.infer<typeof licensePhaseSchema>;

export const licenseStatusSchema = z.object({
  phase: licensePhaseSchema,
  enforced: z.boolean(),
  seats: z.number().int().nonnegative(),
  seatsUsed: z.number().int().nonnegative(),
  seatsRemaining: z.number().int().nonnegative().nullable(),
  licenseId: z.string().nullable(),
  customerId: z.string().nullable(),
  issuedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  graceEndsAt: z.string().datetime().nullable(),
  readOnlyEndsAt: z.string().datetime().nullable(),
  keyFingerprint: z.string().nullable(),
  features: z.record(z.unknown()).default({}),
  canWrite: z.boolean(),
  message: z.string().nullable(),
});
export type LicenseStatus = z.infer<typeof licenseStatusSchema>;

export const activateLicenseBodySchema = z.object({
  key: z.string().trim().min(20).max(4096),
});
export type ActivateLicenseBody = z.infer<typeof activateLicenseBodySchema>;

export const LICENSE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const LICENSE_READ_ONLY_MS = 7 * 24 * 60 * 60 * 1000;
