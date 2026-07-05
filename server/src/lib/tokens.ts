import { SignJWT, jwtVerify } from 'jose';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_WORKSPACE_ID,
} from '@script/shared';
import { env } from '../config/env';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessTokenPayload {
  sub: string;
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secret);
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Invalid access token subject');
  }
  return { sub: payload.sub };
}

export const authCookieNames = {
  access: COOKIE_ACCESS_TOKEN,
  refresh: COOKIE_REFRESH_TOKEN,
  workspace: COOKIE_WORKSPACE_ID,
} as const;
