import {
  LICENSE_GRACE_MS,
  LICENSE_READ_ONLY_MS,
  type ActivateLicenseBody,
  type LicensePhase,
  type LicenseStatus,
} from '@script/shared';
import type { Prisma } from '@prisma/client';
import { BadRequestError, ForbiddenError } from '../../common/errors';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { fingerprintKey, verifyLicenseKey } from './crypto';
import { recordAudit } from '../audit/audit-service';

const OPEN_DEV_SEATS = 1_000_000;

export async function countSeatsUsed(): Promise<number> {
  const rows = await prisma.workspaceMember.findMany({
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.length;
}

function phaseFromExpiry(expiresAt: Date, now: Date): LicensePhase {
  const exp = expiresAt.getTime();
  const t = now.getTime();
  if (t < exp) return 'active';
  if (t < exp + LICENSE_GRACE_MS) return 'grace';
  if (t < exp + LICENSE_GRACE_MS + LICENSE_READ_ONLY_MS) return 'read_only';
  return 'locked';
}

export function isLicenseEnforced(): boolean {
  if (env.LICENSE_ENFORCEMENT === true) return true;
  if (env.LICENSE_PUBLIC_KEY) return true;
  return false;
}

export async function getLicenseStatus(now = new Date()): Promise<LicenseStatus> {
  const enforced = isLicenseEnforced();

  if (!enforced) {
    return {
      phase: 'active',
      enforced: false,
      seats: OPEN_DEV_SEATS,
      seatsUsed: 0,
      seatsRemaining: null,
      licenseId: null,
      customerId: null,
      issuedAt: null,
      expiresAt: null,
      graceEndsAt: null,
      readOnlyEndsAt: null,
      keyFingerprint: null,
      features: {},
      canWrite: true,
      message:
        'License enforcement off (dev/open install). Set LICENSE_PUBLIC_KEY or LICENSE_ENFORCEMENT=true.',
    };
  }

  const seatsUsed = await countSeatsUsed();

  const row = await prisma.licenseActivation.findUnique({ where: { id: 'default' } });
  if (!row) {
    return {
      phase: 'locked',
      enforced: true,
      seats: 0,
      seatsUsed,
      seatsRemaining: 0,
      licenseId: null,
      customerId: null,
      issuedAt: null,
      expiresAt: null,
      graceEndsAt: null,
      readOnlyEndsAt: null,
      keyFingerprint: null,
      features: {},
      canWrite: false,
      message: 'No activation key. Owner/admin must activate a signed license.',
    };
  }

  const phase = phaseFromExpiry(row.expiresAt, now);
  const graceEndsAt = new Date(row.expiresAt.getTime() + LICENSE_GRACE_MS);
  const readOnlyEndsAt = new Date(graceEndsAt.getTime() + LICENSE_READ_ONLY_MS);
  const canWrite = phase === 'active' || phase === 'grace';
  const seatsRemaining = Math.max(0, row.seats - seatsUsed);

  let message: string | null = null;
  if (phase === 'grace') {
    message = `License expired; grace until ${graceEndsAt.toISOString()}. Renew to avoid read-only.`;
  } else if (phase === 'read_only') {
    message = `License in read-only until ${readOnlyEndsAt.toISOString()}. Activate a new key to restore writes.`;
  } else if (phase === 'locked') {
    message = 'License locked. Activate a new signed key to unlock the install.';
  }

  return {
    phase,
    enforced: true,
    seats: row.seats,
    seatsUsed,
    seatsRemaining,
    licenseId: row.licenseId,
    customerId: row.customerId,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
    readOnlyEndsAt: readOnlyEndsAt.toISOString(),
    keyFingerprint: row.keyFingerprint,
    features: (row.features as Record<string, unknown>) ?? {},
    canWrite,
    message,
  };
}

export async function assertLicenseAllowsWrite(): Promise<void> {
  const status = await getLicenseStatus();
  if (!status.canWrite) {
    throw new ForbiddenError(status.message ?? 'License does not allow writes');
  }
}

export async function assertSeatAvailable(additionalSeats = 1): Promise<void> {
  const status = await getLicenseStatus();
  if (!status.enforced) return;
  if (status.seatsUsed + additionalSeats > status.seats) {
    throw new ForbiddenError(
      `Seat limit reached (${status.seatsUsed}/${status.seats}). Upgrade the license or remove members.`,
    );
  }
}

export async function activateLicense(
  body: ActivateLicenseBody,
  actorUserId: string | null,
  ip?: string | null,
): Promise<LicenseStatus> {
  if (!env.LICENSE_PUBLIC_KEY) {
    throw new BadRequestError(
      'LICENSE_PUBLIC_KEY is not configured on this install; cannot verify activation keys.',
    );
  }
  let claims;
  try {
    claims = verifyLicenseKey(env.LICENSE_PUBLIC_KEY, body.key);
  } catch (err) {
    throw new BadRequestError(err instanceof Error ? err.message : 'Invalid license key');
  }

  const issuedAt = new Date(claims.issuedAt * 1000);
  const expiresAt = new Date(claims.expiresAt * 1000);
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    throw new BadRequestError('Invalid license timestamps');
  }

  const featuresJson = (claims.features ?? {}) as Prisma.InputJsonValue;
  const claimsJson = claims as unknown as Prisma.InputJsonValue;

  await prisma.licenseActivation.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      licenseId: claims.licenseId,
      customerId: claims.customerId,
      seats: claims.seats,
      issuedAt,
      expiresAt,
      features: featuresJson,
      keyFingerprint: fingerprintKey(body.key),
      rawClaims: claimsJson,
      activatedById: actorUserId,
    },
    update: {
      licenseId: claims.licenseId,
      customerId: claims.customerId,
      seats: claims.seats,
      issuedAt,
      expiresAt,
      features: featuresJson,
      keyFingerprint: fingerprintKey(body.key),
      rawClaims: claimsJson,
      activatedById: actorUserId,
      activatedAt: new Date(),
    },
  });

  await recordAudit({
    actorUserId,
    action: 'license.activate',
    targetType: 'license',
    targetId: claims.licenseId,
    metadata: {
      customerId: claims.customerId,
      seats: claims.seats,
      expiresAt: expiresAt.toISOString(),
    },
    ip,
  });

  return getLicenseStatus();
}

/** Bootstrap LICENSE_KEY from env once at process start when no row exists. */
export async function bootstrapLicenseFromEnv(): Promise<void> {
  if (!env.LICENSE_KEY || !env.LICENSE_PUBLIC_KEY) return;
  const existing = await prisma.licenseActivation.findUnique({ where: { id: 'default' } });
  if (existing) return;
  try {
    await activateLicense({ key: env.LICENSE_KEY }, null, null);
  } catch {
    // Fail open at boot log level — status endpoint will show locked if needed
  }
}
