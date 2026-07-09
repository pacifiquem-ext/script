import { UTApi } from 'uploadthing/server';
import { env } from '../config/env';
import type { StorageDriver, UploadedFile } from './types';

function getClient() {
  if (!env.UPLOADTHING_TOKEN) {
    throw new Error('UPLOADTHING_TOKEN is required for the uploadthing storage driver');
  }
  return new UTApi({ token: env.UPLOADTHING_TOKEN });
}

/** Normalize UTApi signed-url responses across SDK shapes (v7 direct + legacy { data }). */
export function extractUploadThingUrl(result: unknown): string | null {
  if (typeof result === 'string' && result.length > 0) return result;
  if (!result || typeof result !== 'object') return null;

  const obj = result as {
    error?: { message?: string } | null;
    data?: { url?: string; ufsUrl?: string } | string | null;
    url?: string;
    ufsUrl?: string;
  };

  if (obj.error) {
    throw new Error(obj.error.message ?? 'Failed to sign UploadThing URL');
  }

  if (typeof obj.ufsUrl === 'string' && obj.ufsUrl.length > 0) return obj.ufsUrl;
  if (typeof obj.url === 'string' && obj.url.length > 0) return obj.url;

  if (typeof obj.data === 'string' && obj.data.length > 0) return obj.data;
  if (obj.data && typeof obj.data === 'object') {
    if (typeof obj.data.ufsUrl === 'string' && obj.data.ufsUrl.length > 0) return obj.data.ufsUrl;
    if (typeof obj.data.url === 'string' && obj.data.url.length > 0) return obj.data.url;
  }

  return null;
}

export function createUploadThingDriver(): StorageDriver {
  return {
    async upload(input): Promise<UploadedFile> {
      const utapi = getClient();
      const file = new File([new Uint8Array(input.buffer)], input.filename, {
        type: input.contentType,
      });
      const result = await utapi.uploadFiles(file);
      const uploaded = Array.isArray(result) ? result[0] : result;
      if (!uploaded || uploaded.error || !uploaded.data) {
        throw new Error(uploaded?.error?.message ?? 'UploadThing upload failed');
      }
      return {
        key: uploaded.data.key,
        url: uploaded.data.ufsUrl ?? uploaded.data.url,
        size: uploaded.data.size,
        contentType: input.contentType,
      };
    },

    async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
      const utapi = getClient();

      // Preferred: local HMAC URL (no extra UploadThing API round-trip). UT v7+.
      if (typeof utapi.generateSignedURL === 'function') {
        try {
          const generated = await utapi.generateSignedURL(key, { expiresIn: expiresInSeconds });
          const url = extractUploadThingUrl(generated);
          if (url) return url;
        } catch {
          // Fall through to legacy getSignedURL for older tokens/SDKs.
        }
      }

      const result = await utapi.getSignedURL(key, { expiresIn: expiresInSeconds });
      const url = extractUploadThingUrl(result);
      if (url) return url;
      throw new Error('Failed to sign UploadThing URL');
    },

    async delete(key: string): Promise<void> {
      const utapi = getClient();
      await utapi.deleteFiles(key);
    },
  };
}
