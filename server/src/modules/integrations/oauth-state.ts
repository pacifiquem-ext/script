import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IntegrationProvider } from '@script/shared';
import { BadRequestError } from '../../common/errors';
import { env } from '../../config/env';

export type OAuthStatePayload = {
  provider: IntegrationProvider;
  workspaceId: string;
  userId: string;
  nonce: string;
  exp: number;
};

function sign(body: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(body).digest('base64url');
}

export function encodeSignedPayload(
  payload: Record<string, unknown>,
  ttlSeconds = 15 * 60,
): string {
  const full = {
    ...payload,
    nonce: typeof payload.nonce === 'string' ? payload.nonce : Math.random().toString(36).slice(2),
    exp: typeof payload.exp === 'number' ? payload.exp : Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeSignedPayload<T extends { exp?: number }>(state: string): T {
  const [body, sig] = state.split('.');
  if (!body || !sig) throw new BadRequestError('Invalid OAuth state');
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BadRequestError('Invalid OAuth state signature');
  }
  let payload: T;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    throw new BadRequestError('Invalid OAuth state payload');
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new BadRequestError('OAuth state expired — try connecting again');
  }
  return payload;
}

export function createOAuthState(payload: Omit<OAuthStatePayload, 'exp' | 'nonce'>): string {
  return encodeSignedPayload({ ...payload });
}

export function parseOAuthState(state: string): OAuthStatePayload {
  return decodeSignedPayload<OAuthStatePayload>(state);
}
