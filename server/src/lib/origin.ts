import type { FastifyRequest } from 'fastify';
import { env } from '../config/env';
import { ForbiddenError } from '../common/errors';
import { isAllowedCorsOrigin, isAllowedCorsReferer } from './cors-origins';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function assertSameOrigin(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;

  const origin = request.headers.origin;
  if (!origin) {
    const referer = request.headers.referer;
    if (!referer) {
      if (env.NODE_ENV === 'test') return;
      throw new ForbiddenError('Missing Origin header');
    }
    if (!isAllowedCorsReferer(referer, env.corsOrigins)) {
      throw new ForbiddenError('Invalid Referer');
    }
    return;
  }

  if (!isAllowedCorsOrigin(origin, env.corsOrigins)) {
    throw new ForbiddenError('Invalid Origin');
  }
}
