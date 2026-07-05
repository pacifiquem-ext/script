import { env } from '../config/env';
import { createUploadThingDriver } from './uploadthing';
import { createS3Driver } from './s3';
import type { StorageDriver } from './types';

export type { StorageDriver, UploadedFile } from './types';

let cached: StorageDriver | null = null;

export function createStorageDriver(): StorageDriver {
  switch (env.STORAGE_DRIVER) {
    case 'uploadthing':
      return createUploadThingDriver();
    case 's3':
      return createS3Driver();
  }
}

export const storage: StorageDriver = new Proxy({} as StorageDriver, {
  get(_target, prop, receiver) {
    if (!cached) cached = createStorageDriver();
    const value = Reflect.get(cached, prop, receiver);
    return typeof value === 'function' ? value.bind(cached) : value;
  },
});
