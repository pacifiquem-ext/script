import type { IncomingHttpHeaders } from 'node:http';
import { env } from '../config/env';
import { isAllowedCorsOrigin } from './cors-origins';

/**
 * Headers for hijacked SSE responses. reply.hijack() + writeHead bypass Fastify
 * onSend hooks (@fastify/cors, helmet), so CORS/CORP must be set explicitly or
 * browsers block the stream body on cross-origin SPA → API setups.
 */
export function buildSseHeaders(requestHeaders: IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };

  const origin = requestHeaders.origin;
  if (typeof origin === 'string' && isAllowedCorsOrigin(origin, env.corsOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers.Vary = 'Origin';
  }

  return headers;
}
