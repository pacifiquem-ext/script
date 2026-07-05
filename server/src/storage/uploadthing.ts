import { UTApi } from 'uploadthing/server';
import { env } from '../config/env';
import type { StorageDriver, UploadedFile } from './types';

function getClient() {
  if (!env.UPLOADTHING_TOKEN) {
    throw new Error('UPLOADTHING_TOKEN is required for the uploadthing storage driver');
  }
  return new UTApi({ token: env.UPLOADTHING_TOKEN });
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
      const result = await utapi.getSignedURL(key, { expiresIn: expiresInSeconds });
      if (typeof result === 'string') return result;
      if (result && typeof result === 'object' && 'data' in result) {
        const data = (
          result as { data?: { url?: string } | string | null; error?: { message?: string } }
        ).data;
        const error = (result as { error?: { message?: string } }).error;
        if (error) throw new Error(error.message ?? 'Failed to sign UploadThing URL');
        if (typeof data === 'string') return data;
        if (data?.url) return data.url;
      }
      throw new Error('Failed to sign UploadThing URL');
    },

    async delete(key: string): Promise<void> {
      const utapi = getClient();
      await utapi.deleteFiles(key);
    },
  };
}
