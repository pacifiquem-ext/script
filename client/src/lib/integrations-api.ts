import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CloudFile,
  ImportCloudFilesBody,
  IntegrationProvider,
  ListIntegrationsResponse,
} from '@script/shared';
import { apiRequest } from './api-client';
import { queryKeys } from './query-client';

export function useIntegrations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.integrations,
    enabled,
    queryFn: () => apiRequest<ListIntegrationsResponse>('/integrations'),
  });
}

export function useCloudFiles(provider: IntegrationProvider | null, parentId?: string | null) {
  return useQuery({
    queryKey: queryKeys.cloudFiles(provider ?? 'none', parentId ?? null),
    enabled: Boolean(provider),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (parentId) params.set('parentId', parentId);
      const q = params.toString();
      return apiRequest<{ files: CloudFile[]; nextCursor: string | null; parentId: string | null }>(
        `/integrations/${provider}/files${q ? `?${q}` : ''}`,
      );
    },
  });
}

export function useIntegrationMutations() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.integrations });
    await queryClient.invalidateQueries({ queryKey: ['cloud-files'] });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const connect = useMutation({
    mutationFn: async (provider: IntegrationProvider) => {
      const data = await apiRequest<{ url: string; provider: IntegrationProvider }>(
        `/integrations/${provider}/connect`,
      );
      return data;
    },
  });

  const disconnect = useMutation({
    mutationFn: (provider: IntegrationProvider) =>
      apiRequest<{ ok: true }>(`/integrations/${provider}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const importFiles = useMutation({
    mutationFn: (input: { provider: IntegrationProvider } & ImportCloudFilesBody) =>
      apiRequest(`/integrations/${input.provider}/import`, {
        method: 'POST',
        body: {
          fileIds: input.fileIds,
          folderId: input.folderId,
        },
      }),
    onSuccess: invalidate,
  });

  return { connect, disconnect, importFiles, invalidate };
}

export const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  drive: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  box: 'Box',
};
