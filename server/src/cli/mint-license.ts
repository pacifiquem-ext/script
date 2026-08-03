/**
 * Vendor-only: mint a signed activation key.
 * Never ship LICENSE_PRIVATE_KEY to customer installs.
 *
 * Usage:
 *   LICENSE_PRIVATE_KEY="-----BEGIN..." npx ts-node ... \
 *     --customer acme --seats 25 --days 35
 */
import { mintLicenseKey, generateLicenseKeyPair } from '../modules/license/crypto';

function arg(name: string, fallback?: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

async function main() {
  if (process.argv.includes('--generate-keypair')) {
    const pair = generateLicenseKeyPair();
    process.stdout.write(`${pair.privateKeyPem}\n${pair.publicKeyPem}\n`);
    return;
  }

  const privateKey = process.env.LICENSE_PRIVATE_KEY;
  if (!privateKey) throw new Error('LICENSE_PRIVATE_KEY is required');

  const customerId = arg('customer');
  const seats = Number(arg('seats', '10'));
  const days = Number(arg('days', '35'));
  const licenseId = arg('license-id', `lic_${Date.now()}`);
  const now = Math.floor(Date.now() / 1000);
  const key = mintLicenseKey(privateKey, {
    licenseId,
    customerId,
    seats,
    issuedAt: now,
    expiresAt: now + Math.floor(days * 86400),
    features: {},
  });
  process.stdout.write(`${key}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
