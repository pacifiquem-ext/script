import type { StorageDriver, UploadedFile } from './types';

// S3-compatible driver: works with AWS S3, MinIO, or self-hosted Garage
// (https://garagehq.deuxfleurs.fr). This is what self-hosters should set
// STORAGE_DRIVER=s3 to use instead of the managed UploadThing default.
// See docs/storage.md for setup instructions.
export function createS3Driver(): StorageDriver {
  return {
    async upload(): Promise<UploadedFile> {
      throw new Error(
        'S3-compatible storage driver is boilerplate only — implement upload() before use.',
      );
    },
    async getSignedDownloadUrl(): Promise<string> {
      throw new Error(
        'S3-compatible storage driver is boilerplate only — implement getSignedDownloadUrl() before use.',
      );
    },
    async delete(): Promise<void> {
      throw new Error(
        'S3-compatible storage driver is boilerplate only — implement delete() before use.',
      );
    },
  };
}
