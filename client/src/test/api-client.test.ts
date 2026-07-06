import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@script/shared';
import { getApiBaseUrl } from '../lib/api-client';

describe('api client', () => {
  it('exposes configured API base URL', () => {
    expect(typeof getApiBaseUrl()).toBe('string');
  });

  it('constructs typed API errors', () => {
    const error = new ApiClientError(401, 'UNAUTHORIZED', 'Unauthorized');
    expect(error.status).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });
});
