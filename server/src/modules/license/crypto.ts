import { createPrivateKey, createPublicKey, sign, verify, createHash, generateKeyPairSync } from 'node:crypto';
import { z } from 'zod';

const claimsSchema = z.object({
  licenseId: z.string().min(1).max(128),
  customerId: z.string().min(1).max(128),
  seats: z.number().int().positive().max(1_000_000),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  features: z.record(z.unknown()).optional(),
});

export type LicenseClaims = z.infer<typeof claimsSchema>;

const PREFIX = 'script1';

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

export function fingerprintKey(key: string): string {
  return createHash('sha256').update(key.trim()).digest('hex').slice(0, 16);
}

export function generateLicenseKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function mintLicenseKey(privateKeyPem: string, claims: LicenseClaims): string {
  const parsed = claimsSchema.parse(claims);
  if (parsed.expiresAt <= parsed.issuedAt) {
    throw new Error('expiresAt must be after issuedAt');
  }
  const payload = b64url(Buffer.from(JSON.stringify(parsed), 'utf8'));
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, Buffer.from(`${PREFIX}.${payload}`, 'utf8'), key);
  return `${PREFIX}.${payload}.${b64url(sig)}`;
}

export function verifyLicenseKey(publicKeyPem: string, key: string): LicenseClaims {
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    throw new Error('Invalid license key format');
  }
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) throw new Error('Invalid license key format');
  const payloadBytes = fromB64url(payloadB64);
  const sig = fromB64url(sigB64);
  const pub = createPublicKey(publicKeyPem);
  const ok = verify(null, Buffer.from(`${PREFIX}.${payloadB64}`, 'utf8'), pub, sig);
  if (!ok) throw new Error('Invalid license signature');
  const json = JSON.parse(payloadBytes.toString('utf8')) as unknown;
  return claimsSchema.parse(json);
}
