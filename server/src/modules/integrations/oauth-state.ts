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

export function createOAuthState(payload: Omit<OAuthStatePayload, 'exp' | 'nonce'>): string {
  const full: OAuthStatePayload = {
    ...payload,
    nonce: Math.random().toString(36).slice(2),
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
  };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function parseOAuthState(state: string): OAuthStatePayload {
  const [body, sig] = state.split('.');
  if (!body || !sig) throw new BadRequestError('Invalid OAuth state');
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BadRequestError('Invalid OAuth state signature');
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
  } catch {
    throw new BadRequestError('Invalid OAuth state payload');
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new BadRequestError('OAuth state expired — try connecting again');
  }
  return payload;
}
