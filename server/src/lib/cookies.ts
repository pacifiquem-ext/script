import type { FastifyReply } from 'fastify';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_WORKSPACE_ID,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@script/shared';
import { env } from '../config/env';

const secure = env.NODE_ENV === 'production';

function baseCookie(maxAge: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function setAuthCookies(
  reply: FastifyReply,
  input: { accessToken: string; refreshToken: string; workspaceId: string | null },
): void {
  reply.setCookie(COOKIE_ACCESS_TOKEN, input.accessToken, baseCookie(ACCESS_TOKEN_TTL_SECONDS));
  reply.setCookie(COOKIE_REFRESH_TOKEN, input.refreshToken, baseCookie(REFRESH_TOKEN_TTL_SECONDS));
  if (input.workspaceId) {
    reply.setCookie(COOKIE_WORKSPACE_ID, input.workspaceId, {
      ...baseCookie(REFRESH_TOKEN_TTL_SECONDS),
      httpOnly: false,
    });
  }
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_ACCESS_TOKEN, { path: '/' });
  reply.clearCookie(COOKIE_REFRESH_TOKEN, { path: '/' });
  reply.clearCookie(COOKIE_WORKSPACE_ID, { path: '/' });
}

export function setWorkspaceCookie(reply: FastifyReply, workspaceId: string): void {
  reply.setCookie(COOKIE_WORKSPACE_ID, workspaceId, {
    ...baseCookie(REFRESH_TOKEN_TTL_SECONDS),
    httpOnly: false,
  });
}
