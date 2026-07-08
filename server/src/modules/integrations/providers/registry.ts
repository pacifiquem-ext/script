import type { IntegrationProvider } from '@script/shared';
import { BadRequestError } from '../../../common/errors';
import { boxAdapter } from './box';
import { driveAdapter } from './drive';
import { dropboxAdapter } from './dropbox';
import { onedriveAdapter } from './onedrive';
import type { CloudProviderAdapter } from './types';

const adapters: Record<IntegrationProvider, CloudProviderAdapter> = {
  drive: driveAdapter,
  dropbox: dropboxAdapter,
  onedrive: onedriveAdapter,
  box: boxAdapter,
};

export const ALL_PROVIDERS = Object.keys(adapters) as IntegrationProvider[];

export function getProviderAdapter(provider: string): CloudProviderAdapter {
  if (!(provider in adapters)) {
    throw new BadRequestError(`Unknown integration provider: ${provider}`);
  }
  return adapters[provider as IntegrationProvider];
}

export function listProviderAdapters(): CloudProviderAdapter[] {
  return ALL_PROVIDERS.map((p) => adapters[p]);
}
