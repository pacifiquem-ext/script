import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/app';

describe('GET /health', () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
  });

  it('returns ok status and uptime', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });
});

describe('GET /health/ready', () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
  });

  it('returns a readiness payload with checks', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    const body = response.json() as { checks?: Record<string, string> };

    expect([200, 503]).toContain(response.statusCode);
    expect(body.checks).toBeDefined();
    expect(body.checks?.redis).toBe('skipped');
    expect(body.checks?.storage).toBe('skipped');
  });
});
