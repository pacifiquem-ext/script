import { Resend } from 'resend';
import type { OtpPurpose } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

function purposeLabel(purpose: OtpPurpose): string {
  switch (purpose) {
    case 'signup_verify':
      return 'verify your email';
    case 'password_reset':
      return 'reset your password';
    case 'login':
      return 'sign in';
  }
}

export async function sendOtpEmail(input: {
  to: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<void> {
  const subject = `Your script code: ${input.code}`;
  const text = `Your code to ${purposeLabel(input.purpose)} is ${input.code}. It expires in 10 minutes.`;

  if (!canSendViaResend()) {
    logger.info({ to: input.to, purpose: input.purpose, code: input.code }, 'OTP email (dev log)');
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY!);
  const result = await resend.emails.send({
    from: env.EMAIL_FROM!,
    to: input.to,
    subject,
    text,
  });
  if (result.error) {
    logger.error({ err: result.error }, 'failed to send OTP email');
    const error = new Error(result.error.message);
    (error as Error & { code?: string }).code = 'BAD_REQUEST';
    throw error;
  }
}

function canSendViaResend(): boolean {
  if (env.NODE_ENV === 'test') return false;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const from = env.EMAIL_FROM.toLowerCase();
  if (from.endsWith('.invalid') || from.includes('localhost') || from.endsWith('.local')) {
    return false;
  }
  return true;
}
