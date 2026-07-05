import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OtpPurpose, User } from '@prisma/client';
import {
  COOKIE_REFRESH_TOKEN,
  REFRESH_TOKEN_TTL_SECONDS,
  SIGNUP_CREDIT_GRANT,
  type ChangePasswordBody,
  type LoginBody,
  type RequestPasswordResetBody,
  type ResendOtpBody,
  type ResetPasswordBody,
  type SignUpBody,
  type VerifyOtpBody,
} from '@script/shared';
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
} from '../../common/errors';
import { prisma } from '../../db/prisma';
import { generateOtpCode, generateRefreshToken, sha256 } from '../../lib/crypto';
import { clearAuthCookies, setAuthCookies } from '../../lib/cookies';
import { hashPassword, verifyPassword } from '../../lib/password';
import { signAccessToken } from '../../lib/tokens';
import { sendOtpEmail } from '../email/mailer';
import { toPublicUser } from './serialize';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const GENERIC_AUTH_ERROR = 'Invalid email or password';

function clientMeta(request: FastifyRequest) {
  return {
    userAgent: request.headers['user-agent']?.slice(0, 500) ?? null,
    ip: request.ip,
  };
}

async function issueSession(
  reply: FastifyReply,
  request: FastifyRequest,
  user: User,
  workspaceId: string | null,
) {
  const accessToken = await signAccessToken(user.id);
  const refreshToken = generateRefreshToken();
  const tokenHash = sha256(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const meta = clientMeta(request);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });

  const activeWorkspaceId = workspaceId ?? user.lastWorkspaceId;
  if (activeWorkspaceId && activeWorkspaceId !== user.lastWorkspaceId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastWorkspaceId: activeWorkspaceId },
    });
  }

  setAuthCookies(reply, {
    accessToken,
    refreshToken,
    workspaceId: activeWorkspaceId,
  });

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return toPublicUser(fresh);
}

async function createOtp(email: string, purpose: OtpPurpose, userId?: string | null) {
  const recent = await prisma.emailOtp.findFirst({
    where: {
      email,
      purpose,
      consumedAt: null,
      createdAt: { gte: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    throw new BadRequestError('Please wait before requesting another code');
  }

  const code = generateOtpCode();
  await prisma.emailOtp.create({
    data: {
      email,
      purpose,
      userId: userId ?? null,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  await sendOtpEmail({ to: email, code, purpose });
}

async function consumeOtp(email: string, purpose: OtpPurpose, code: string) {
  const otp = await prisma.emailOtp.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt.getTime() < Date.now()) {
    throw new BadRequestError('Invalid or expired code');
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new BadRequestError('Too many invalid attempts. Request a new code.');
  }
  if (otp.codeHash !== sha256(code)) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new BadRequestError('Invalid or expired code');
  }
  await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return otp;
}

export async function signUp(body: SignUpBody) {
  const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await hashPassword(body.password);
  const created = await prisma.user.create({
    data: {
      email,
      name: body.name,
      passwordHash,
      memberships: {
        create: {
          role: 'owner',
          workspace: {
            create: {
              name: 'Personal Workspace',
              plan: 'free',
              creditBalance: { create: { balance: SIGNUP_CREDIT_GRANT } },
              creditLedger: {
                create: {
                  delta: SIGNUP_CREDIT_GRANT,
                  reason: 'signup_grant',
                  note: 'Initial signup grant',
                },
              },
            },
          },
        },
      },
    },
    include: { memberships: true },
  });
  const workspaceId = created.memberships[0]?.workspaceId;
  const user = await prisma.user.update({
    where: { id: created.id },
    data: { lastWorkspaceId: workspaceId },
  });
  if (workspaceId) {
    await prisma.creditLedgerEntry.updateMany({
      where: { workspaceId, userId: null },
      data: { userId: user.id },
    });
  }

  await createOtp(email, 'signup_verify', user.id);
  return { requiresVerification: true as const, email };
}

export async function login(body: LoginBody, request: FastifyRequest, reply: FastifyReply) {
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
    throw new UnauthorizedError(GENERIC_AUTH_ERROR);
  }
  if (!user.emailVerifiedAt) {
    await createOtp(email, 'signup_verify', user.id);
    return { requiresVerification: true as const, email };
  }
  const publicUser = await issueSession(reply, request, user, user.lastWorkspaceId);
  return { requiresVerification: false as const, user: publicUser };
}

export async function verifyOtp(body: VerifyOtpBody, request: FastifyRequest, reply: FastifyReply) {
  const email = body.email.toLowerCase();
  await consumeOtp(email, body.purpose, body.code);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new NotFoundError('User');

  if (body.purpose === 'signup_verify' || body.purpose === 'login') {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
    const publicUser = await issueSession(reply, request, updated, updated.lastWorkspaceId);
    return { user: publicUser };
  }

  return { email, resetAllowed: true as const };
}

export async function resendOtp(body: ResendOtpBody) {
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: true as const };
  }
  if (body.purpose === 'signup_verify' && user.emailVerifiedAt) {
    return { ok: true as const };
  }
  await createOtp(email, body.purpose, user.id);
  return { ok: true as const };
}

export async function requestPasswordReset(body: RequestPasswordResetBody) {
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    await createOtp(email, 'password_reset', user.id);
  }
  return { ok: true as const };
}

export async function resetPassword(
  body: ResetPasswordBody,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const email = body.email.toLowerCase();
  await consumeOtp(email, 'password_reset', body.code);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new NotFoundError('User');

  const passwordHash = await hashPassword(body.password);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.user.update({
      where: { id: user.id },
      data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
  });

  const publicUser = await issueSession(reply, request, updated, updated.lastWorkspaceId);
  return { user: publicUser };
}

export async function refreshSession(request: FastifyRequest, reply: FastifyReply) {
  const raw = request.cookies[COOKIE_REFRESH_TOKEN];
  if (!raw) throw new UnauthorizedError();
  const tokenHash = sha256(raw);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    clearAuthCookies(reply);
    throw new UnauthorizedError();
  }

  const nextRaw = generateRefreshToken();
  const nextHash = sha256(nextRaw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const meta = clientMeta(request);

  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: nextHash,
        expiresAt,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedByTokenId: created.id },
    });
  });

  const accessToken = await signAccessToken(stored.userId);
  setAuthCookies(reply, {
    accessToken,
    refreshToken: nextRaw,
    workspaceId: stored.user.lastWorkspaceId,
  });
  return { user: await toPublicUser(stored.user) };
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const raw = request.cookies[COOKIE_REFRESH_TOKEN];
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearAuthCookies(reply);
  return { ok: true as const };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();
  return { user: await toPublicUser(user) };
}

export async function changePassword(userId: string, body: ChangePasswordBody) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();
  if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
    throw new UnauthorizedError('Current password is incorrect');
  }
  const passwordHash = await hashPassword(body.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
  return { ok: true as const };
}
