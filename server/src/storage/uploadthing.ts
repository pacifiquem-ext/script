import type { StorageDriver, UploadedFile } from './types';

// Managed storage driver, default for hosted deployments. See docs/storage.md
// for the self-hosted alternative (STORAGE_DRIVER=s3, e.g. Garage).
export function createUploadThingDriver(): StorageDriver {
  return {
    async upload(): Promise<UploadedFile> {
      throw new Error(
        'UploadThing storage driver is boilerplate only — implement upload() before use.',
      );
    },
    async getSignedDownloadUrl(): Promise<string> {
      throw new Error(
        'UploadThing storage driver is boilerplate only — implement getSignedDownloadUrl() before use.',
      );
    },
    async delete(): Promise<void> {
      throw new Error(
        'UploadThing storage driver is boilerplate only — implement delete() before use.',
      );
    },
  };
}
