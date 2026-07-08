import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ConfigurationError } from '../common/errors';
import { env } from '../config/env';

const ALGO = 'aes-256-gcm';

function keyBytes(): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new ConfigurationError(
      "TOKEN_ENCRYPTION_KEY is required to store OAuth tokens. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  // Derive a 32-byte key from any secret string
  return createHash('sha256').update(raw).digest();
}

/** Encrypt a secret string for at-rest storage (AES-256-GCM). Format: iv:tag:ciphertext (base64). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted secret payload');
  const decipher = createDecipheriv(ALGO, keyBytes(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function hasTokenEncryptionKey(): boolean {
  return Boolean(env.TOKEN_ENCRYPTION_KEY);
}
