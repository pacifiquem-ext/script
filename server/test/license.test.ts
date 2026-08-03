import { describe, expect, it } from 'vitest';
import {
  generateLicenseKeyPair,
  mintLicenseKey,
  verifyLicenseKey,
  fingerprintKey,
} from '../src/modules/license/crypto';
import {
  getLicenseStatus,
  assertLicenseAllowsWrite,
  assertSeatAvailable,
} from '../src/modules/license/license-service';

describe('license crypto', () => {
  it('mints and verifies ed25519 keys', () => {
    const { publicKeyPem, privateKeyPem } = generateLicenseKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const key = mintLicenseKey(privateKeyPem, {
      licenseId: 'lic_test',
      customerId: 'cust_test',
      seats: 5,
      issuedAt: now,
      expiresAt: now + 86400,
    });
    const claims = verifyLicenseKey(publicKeyPem, key);
    expect(claims.seats).toBe(5);
    expect(claims.licenseId).toBe('lic_test');
    expect(fingerprintKey(key)).toHaveLength(16);
  });

  it('rejects tampered keys', () => {
    const { publicKeyPem, privateKeyPem } = generateLicenseKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const key = mintLicenseKey(privateKeyPem, {
      licenseId: 'lic_t',
      customerId: 'c',
      seats: 1,
      issuedAt: now,
      expiresAt: now + 1000,
    });
    const parts = key.split('.');
    parts[1] = Buffer.from(JSON.stringify({ licenseId: 'x', customerId: 'y', seats: 99, issuedAt: now, expiresAt: now + 1000 })).toString('base64url');
    expect(() => verifyLicenseKey(publicKeyPem, parts.join('.'))).toThrow(/signature/i);
  });
});

describe('license service open-dev', () => {
  it('allows writes when enforcement is off', async () => {
    const status = await getLicenseStatus();
    expect(status.enforced).toBe(false);
    expect(status.canWrite).toBe(true);
    await expect(assertLicenseAllowsWrite()).resolves.toBeUndefined();
    await expect(assertSeatAvailable(1)).resolves.toBeUndefined();
  });
});

describe('license phase math', () => {
  it('maps expiry windows via verified claims timestamps', () => {
    const { publicKeyPem, privateKeyPem } = generateLicenseKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const expired = mintLicenseKey(privateKeyPem, {
      licenseId: 'lic_exp',
      customerId: 'c',
      seats: 2,
      issuedAt: now - 40 * 86400,
      expiresAt: now - 10 * 86400,
    });
    const claims = verifyLicenseKey(publicKeyPem, expired);
    expect(claims.expiresAt).toBeLessThan(now);
  });
});
