import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicDocument, PublicDocumentDetail, PublicFolder } from '@script/shared';
import { apiRequest, getApiBaseUrl } from './api-client';
import { queryKeys } from './query-client';

export function useFolders(parentId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.folders('current'), parentId],
    enabled,
    queryFn: async () => {
      const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      const data = await apiRequest<{ folders: PublicFolder[] }>(`/folders${qs}`);
      return data.folders;
    },
    refetchInterval: 5000,
  });
}

export function useDocuments(folderId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.documents('current', folderId),
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.set('folderId', folderId);
      const q = params.toString();
      const data = await apiRequest<{ data: PublicDocument[]; pagination: unknown }>(
        `/documents${q ? `?${q}` : ''}`,
      );
      return data.data;
    },
    refetchInterval: 3000,
  });
}

export function useDocument(documentId: string | null) {
  return useQuery({
    queryKey: documentId ? queryKeys.document(documentId) : ['documents', 'none'],
    enabled: Boolean(documentId),
    queryFn: async () => {
      const data = await apiRequest<{ document: PublicDocumentDetail }>(`/documents/${documentId}`);
      return data.document;
    },
    refetchInterval: (query) => (query.state.data?.status === 'ready' ? false : 2000),
  });
}

export function useLibraryMutations() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['folders'] });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const createFolder = useMutation({
    mutationFn: (input: { name: string; parentId?: string | null }) =>
      apiRequest<{ folder: PublicFolder }>('/folders', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });

  const deleteFolder = useMutation({
    mutationFn: (folderId: string) => apiRequest(`/folders/${folderId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const deleteDocument = useMutation({
    mutationFn: (documentId: string) =>
      apiRequest(`/documents/${documentId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const importUrl = useMutation({
    mutationFn: (input: { url: string; folderId?: string | null; name?: string }) =>
      apiRequest<{ document: PublicDocument }>('/documents/import-url', {
        method: 'POST',
        body: input,
      }),
    onSuccess: invalidate,
  });

  const uploadFile = useMutation({
    mutationFn: async (input: { file: File; folderId?: string | null }) => {
      const form = new FormData();
      form.append('file', input.file);
      if (input.folderId) form.append('folderId', input.folderId);
      const response = await fetch(`${getApiBaseUrl()}/documents/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Upload failed');
      }
      return response.json() as Promise<{ document: PublicDocument }>;
    },
    onSuccess: invalidate,
  });

  return { createFolder, deleteFolder, deleteDocument, importUrl, uploadFile, invalidate };
}
