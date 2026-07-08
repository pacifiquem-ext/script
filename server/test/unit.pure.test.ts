import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { ZodError, z } from 'zod';
import { registerErrorHandler } from '../src/common/error-handler';
import {
  AppError,
  BadRequestError,
  ConfigurationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  isAppError,
} from '../src/common/errors';
import { paginate, toSkipTake } from '../src/common/pagination';
import {
  authRateLimitConfig,
  backfillRateLimitConfig,
  chatMessageRateLimitConfig,
} from '../src/config/rate-limits';
import { clearAuthCookies, setAuthCookies, setWorkspaceCookie } from '../src/lib/cookies';
import { generateOtpCode, generateRefreshToken, sha256 } from '../src/lib/crypto';
import { assertSameOrigin } from '../src/lib/origin';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { assertSafeUrl } from '../src/lib/ssrf';
import { authCookieNames, signAccessToken, verifyAccessToken } from '../src/lib/tokens';
import { chunkText, extractText } from '../src/modules/jobs/extract';

describe('errors', () => {
  it('constructs typed app errors', () => {
    expect(new BadRequestError().statusCode).toBe(400);
    expect(new UnauthorizedError().code).toBe('UNAUTHORIZED');
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError('Doc').message).toContain('Doc');
    expect(new ConflictError('taken').statusCode).toBe(409);
    expect(new ServiceUnavailableError().statusCode).toBe(503);
    expect(new ConfigurationError('missing key').code).toBe('CONFIGURATION_ERROR');
    expect(isAppError(new AppError('x', 418, 'TEAPOT'))).toBe(true);
    expect(isAppError(new Error('nope'))).toBe(false);
  });
});

describe('pagination re-export', () => {
  it('mirrors shared helpers', () => {
    expect(toSkipTake({ page: 2, pageSize: 5 })).toEqual({ skip: 5, take: 5 });
    expect(paginate([1], 11, { page: 1, pageSize: 5 }).pagination.totalPages).toBe(3);
  });
});

describe('rate limits', () => {
  it('exports positive limits', () => {
    expect(authRateLimitConfig.max).toBeGreaterThan(0);
    expect(chatMessageRateLimitConfig.max).toBeGreaterThan(0);
    expect(backfillRateLimitConfig.max).toBeGreaterThan(0);
  });
});

describe('crypto helpers', () => {
  it('hashes and generates tokens/otp', () => {
    expect(sha256('abc')).toHaveLength(64);
    expect(generateRefreshToken().length).toBeGreaterThan(20);
    const otp = generateOtpCode();
    expect(otp).toMatch(/^\d{6}$/);
  });
});

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('password123');
    expect(await verifyPassword(hash, 'password123')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'password123')).toBe(false);
  });
});

describe('tokens', () => {
  it('signs and verifies access JWTs', async () => {
    const token = await signAccessToken('user-1');
    expect((await verifyAccessToken(token)).sub).toBe('user-1');
    await expect(verifyAccessToken('not.a.jwt')).rejects.toThrow();
    expect(authCookieNames.access).toBeTruthy();
  });
});

describe('cookies', () => {
  it('sets and clears auth cookies on reply', () => {
    const setCookie = vi.fn();
    const clearCookie = vi.fn();
    const reply = { setCookie, clearCookie } as never;
    setAuthCookies(reply, {
      accessToken: 'a',
      refreshToken: 'r',
      workspaceId: 'w1',
    });
    expect(setCookie).toHaveBeenCalledTimes(3);
    setWorkspaceCookie(reply, 'w2');
    expect(setCookie).toHaveBeenCalledTimes(4);
    clearAuthCookies(reply);
    expect(clearCookie).toHaveBeenCalledTimes(3);
  });

  it('omits workspace cookie when null', () => {
    const setCookie = vi.fn();
    setAuthCookies({ setCookie, clearCookie: vi.fn() } as never, {
      accessToken: 'a',
      refreshToken: 'r',
      workspaceId: null,
    });
    expect(setCookie).toHaveBeenCalledTimes(2);
  });
});

describe('origin guard', () => {
  it('allows safe methods and matching origin', () => {
    expect(() => assertSameOrigin({ method: 'GET', headers: {} } as never)).not.toThrow();
    expect(() =>
      assertSameOrigin({
        method: 'POST',
        headers: { origin: 'http://localhost:5173' },
      } as never),
    ).not.toThrow();
  });

  it('rejects mismatched origin', () => {
    expect(() =>
      assertSameOrigin({
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      } as never),
    ).toThrow(ForbiddenError);
  });

  it('allows missing origin in test env', () => {
    expect(() => assertSameOrigin({ method: 'POST', headers: {} } as never)).not.toThrow();
  });

  it('validates referer when origin missing', () => {
    expect(() =>
      assertSameOrigin({
        method: 'POST',
        headers: { referer: 'http://localhost:5173/app' },
      } as never),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin({
        method: 'POST',
        headers: { referer: 'https://evil.example/' },
      } as never),
    ).toThrow(ForbiddenError);
  });
});

describe('ssrf assertSafeUrl', () => {
  it('rejects invalid, non-http, credentialed, and local hosts', async () => {
    await expect(assertSafeUrl('not a url')).rejects.toBeInstanceOf(BadRequestError);
    await expect(assertSafeUrl('ftp://example.com/a')).rejects.toBeInstanceOf(BadRequestError);
    await expect(assertSafeUrl('https://user:pass@example.com/a')).rejects.toBeInstanceOf(
      BadRequestError,
    );
    await expect(assertSafeUrl('http://localhost/a')).rejects.toBeInstanceOf(BadRequestError);
    await expect(assertSafeUrl('http://foo.local/a')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('accepts public https URLs that resolve publicly', async () => {
    const url = await assertSafeUrl('https://example.com/doc.pdf');
    expect(url.hostname).toBe('example.com');
  });
});

describe('chunkText', () => {
  it('returns empty for blank input', () => {
    expect(chunkText('   ')).toEqual([]);
  });

  it('splits with overlap and paragraph awareness', () => {
    const para = 'A'.repeat(500) + '\n\n' + 'B'.repeat(500) + '\n\n' + 'C'.repeat(500);
    const chunks = chunkText(para, 600, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.startOffset).toBe(0);
    expect(chunks[0]!.content.length).toBeGreaterThan(0);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startOffset).toBeLessThan(chunks[i - 1]!.endOffset);
    }
  });
});

describe('extractText', () => {
  it('reads plain text and markdown', async () => {
    const { text } = await extractText(Buffer.from('# hello\nworld'), 'text/plain', 'note.txt');
    expect(text).toContain('hello');
  });

  it('reads csv by extension', async () => {
    const { text } = await extractText(
      Buffer.from('a,b\n1,2'),
      'application/octet-stream',
      't.csv',
    );
    expect(text).toContain('a,b');
  });

  it('rejects unsupported types without unstructured', async () => {
    await expect(
      extractText(Buffer.from('x'), 'application/octet-stream', 'x.bin'),
    ).rejects.toThrow(/Unsupported file type/);
  });
});

describe('error handler', () => {
  it('maps AppError, ZodError, and not-found', async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.get('/app-error', async () => {
      throw new BadRequestError('bad');
    });
    app.get('/zod', async () => {
      z.object({ x: z.string() }).parse({});
    });
    app.get('/boom', async () => {
      throw new Error('secret');
    });
    await app.ready();

    const appErr = await app.inject({ method: 'GET', url: '/app-error' });
    expect(appErr.statusCode).toBe(400);
    expect(appErr.json().error.code).toBe('BAD_REQUEST');

    const zod = await app.inject({ method: 'GET', url: '/zod' });
    expect(zod.statusCode).toBe(400);
    expect(zod.json().error.code).toBe('VALIDATION_ERROR');

    const boom = await app.inject({ method: 'GET', url: '/boom' });
    expect(boom.statusCode).toBe(500);
    expect(boom.json().error.message).toBe('Something went wrong');

    const missing = await app.inject({ method: 'GET', url: '/missing' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');

    await app.close();
  });
});

describe('error handler client errors', () => {
  it('forwards Fastify 4xx errors', async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.get('/rate', async () => {
      const err = new Error('slow down') as Error & { statusCode: number; code: string };
      err.statusCode = 429;
      err.code = 'FST_ERR_RATE_LIMIT';
      throw err;
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/rate' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('FST_ERR_RATE_LIMIT');
    await app.close();
  });
});
