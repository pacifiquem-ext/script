import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toContain('correct horse battery');
    await expect(verifyPassword(hash, 'correct horse battery')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false);
  });
});
