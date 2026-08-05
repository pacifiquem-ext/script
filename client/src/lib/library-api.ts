import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COOKIE_WORKSPACE_ID,
  WORKSPACE_HEADER,
  type PublicDocument,
  type PublicDocumentDetail,
  type PublicFolder,
} from '@script/shared';
import { apiRequest, getApiBaseUrl } from './api-client';
import { queryKeys } from './query-client';

function hasActiveProcessing(docs: PublicDocument[] | undefined): boolean {
  return Boolean(
    docs?.some((d) => d.status === 'pending' || d.status === 'processing' || d.isUpdating),
  );
}

function readWorkspaceCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_WORKSPACE_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function parseUploadErrorBody(text: string, status: number): Error {
  try {
    const json = JSON.parse(text) as { error?: { message?: string; code?: string } };
    if (json?.error?.message) {
      return new Error(json.error.message);
    }
  } catch {
    // fall through
  }
  return new Error(text || `Upload failed (${status})`);
}

type UploadResult = {
  document: PublicDocument;
  version?: import('@script/shared').PublicDocumentVersion | null;
  deduplicated?: boolean;
};

async function postMultipartUpload(
  urlPath: string,
  form: FormData,
  options?: { onProgress?: (percent: number) => void },
): Promise<UploadResult> {
  // Progress callbacks need XHR; keep fetch when no progress (tests + simple callers).
  if (!options?.onProgress) {
    const headers = new Headers();
    const workspaceId = readWorkspaceCookie();
    if (workspaceId) headers.set(WORKSPACE_HEADER, workspaceId);
    const response = await fetch(`${getApiBaseUrl()}${urlPath}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw parseUploadErrorBody(text, response.status);
    }
    return response.json() as Promise<UploadResult>;
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getApiBaseUrl()}${urlPath}`);
    xhr.withCredentials = true;
    const workspaceId = readWorkspaceCookie();
    if (workspaceId) xhr.setRequestHeader(WORKSPACE_HEADER, workspaceId);

    options.onProgress?.(0);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
      options.onProgress?.(percent);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          options.onProgress?.(100);
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new Error('Invalid upload response'));
        }
        return;
      }
      reject(parseUploadErrorBody(xhr.responseText, xhr.status));
    };

    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(form);
  });
}

/** Upload a single file; reports 0–100 progress when `onProgress` is provided (XHR path). */
export async function uploadDocumentFile(
  input: { file: File; folderId?: string | null },
  options?: { onProgress?: (percent: number) => void },
): Promise<{ document: PublicDocument }> {
  const form = new FormData();
  form.append('file', input.file);
  if (input.folderId) form.append('folderId', input.folderId);
  return postMultipartUpload('/documents/upload', form, options);
}

/** Upload revised bytes as a new version of an existing document. */
export async function uploadDocumentVersionFile(
  input: { documentId: string; file: File },
  options?: { onProgress?: (percent: number) => void },
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', input.file);
  return postMultipartUpload(`/documents/${input.documentId}/versions`, form, options);
}

export function useFolders(parentId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.folders('current'), parentId],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      const data = await apiRequest<{ folders: PublicFolder[] }>(`/folders${qs}`);
      return data.folders;
    },
  });
}

export function useDocuments(
  folderId: string | null = null,
  enabled = true,
  options?: { pageSize?: number },
) {
  const pageSize = options?.pageSize;
  return useQuery({
    queryKey: [...queryKeys.documents('current', folderId), pageSize ?? 'default'],
    enabled,
    staleTime: 10_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.set('folderId', folderId);
      if (pageSize) params.set('pageSize', String(pageSize));
      const q = params.toString();
      const data = await apiRequest<{ data: PublicDocument[]; pagination: unknown }>(
        `/documents${q ? `?${q}` : ''}`,
      );
      return data.data;
    },
    // Poll only while documents are still processing — not forever every 3s.
    refetchInterval: (query) => (hasActiveProcessing(query.state.data) ? 3000 : false),
  });
}

export function useDocument(documentId: string | null, options?: { versionId?: string | null }) {
  const versionId = options?.versionId ?? null;
  return useQuery({
    queryKey: documentId
      ? [...queryKeys.document(documentId), versionId ?? 'current']
      : ['documents', 'none'],
    enabled: Boolean(documentId),
    staleTime: 30_000,
    queryFn: async () => {
      const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
      const data = await apiRequest<{ document: PublicDocumentDetail }>(
        `/documents/${documentId}${qs}`,
      );
      return data.document;
    },
    refetchInterval: (query) => {
      const doc = query.state.data;
      if (!doc) return false;
      if (doc.isUpdating) return 2000;
      const status = doc.status;
      if (!status || status === 'ready' || status === 'failed') return false;
      return 2000;
    },
  });
}

export function useDocumentVersions(documentId: string | null) {
  return useQuery({
    queryKey: documentId
      ? [...queryKeys.document(documentId), 'versions']
      : ['documents', 'versions', 'none'],
    enabled: Boolean(documentId),
    staleTime: 15_000,
    queryFn: async () => {
      const data = await apiRequest<{ versions: import('@script/shared').PublicDocumentVersion[] }>(
        `/documents/${documentId}/versions`,
      );
      return data.versions;
    },
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

  const updateFolder = useMutation({
    mutationFn: (input: { folderId: string; name?: string; parentId?: string | null }) =>
      apiRequest<{ folder: PublicFolder }>(`/folders/${input.folderId}`, {
        method: 'PATCH',
        body: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        },
      }),
    onSuccess: invalidate,
  });

  const deleteFolder = useMutation({
    mutationFn: (folderId: string) => apiRequest(`/folders/${folderId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const updateDocument = useMutation({
    mutationFn: (input: { documentId: string; name?: string; folderId?: string | null }) =>
      apiRequest<{ document: PublicDocument }>(`/documents/${input.documentId}`, {
        method: 'PATCH',
        body: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        },
      }),
    onSuccess: invalidate,
  });

  const deleteDocument = useMutation({
    mutationFn: (documentId: string) =>
      apiRequest(`/documents/${documentId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const reprocessDocument = useMutation({
    mutationFn: (documentId: string) =>
      apiRequest<{ document: PublicDocument }>(`/documents/${documentId}/reprocess`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const rollbackDocumentVersion = useMutation({
    mutationFn: (input: { documentId: string; versionId: string }) =>
      apiRequest<{
        document: PublicDocument;
        version: import('@script/shared').PublicDocumentVersion;
      }>(`/documents/${input.documentId}/versions/${input.versionId}/rollback`, {
        method: 'POST',
      }),
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
    mutationFn: (input: {
      file: File;
      folderId?: string | null;
      onProgress?: (percent: number) => void;
    }) =>
      uploadDocumentFile(
        { file: input.file, folderId: input.folderId },
        { onProgress: input.onProgress },
      ),
    onSuccess: invalidate,
  });

  const uploadDocumentVersion = useMutation({
    mutationFn: (input: {
      documentId: string;
      file: File;
      onProgress?: (percent: number) => void;
    }) =>
      uploadDocumentVersionFile(
        { documentId: input.documentId, file: input.file },
        { onProgress: input.onProgress },
      ),
    onSuccess: invalidate,
  });

  return {
    createFolder,
    updateFolder,
    deleteFolder,
    updateDocument,
    deleteDocument,
    reprocessDocument,
    rollbackDocumentVersion,
    importUrl,
    uploadFile,
    uploadDocumentVersion,
    invalidate,
  };
}

/** Match document names / basenames mentioned in free text (for chat scope). */
export function matchDocumentsInText(content: string, docs: PublicDocument[]): PublicDocument[] {
  const hay = content.toLowerCase();
  return [...docs]
    .sort((a, b) => b.name.length - a.name.length)
    .filter((doc) => {
      const full = doc.name.toLowerCase();
      if (hay.includes(full) || hay.includes(`@${full}`)) return true;
      const base = full.replace(/\.[^.]+$/, '');
      return base.length >= 5 && (hay.includes(base) || hay.includes(`@${base}`));
    });
}

export function buildDocumentPrompts(docs: PublicDocument[], limit = 4): string[] {
  const ready = [...docs]
    .filter((d) => d.status === 'ready')
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6);
  if (!ready.length) {
    return [
      'What documents are in my library?',
      'Summarize my latest upload',
      'What should I know from my files?',
    ];
  }
  const prompts: string[] = [];
  for (const doc of ready) {
    if (prompts.length >= limit) break;
    prompts.push(`Summarize ${doc.name}`);
  }
  if (prompts.length < limit && ready[0]) {
    prompts.push(`What are the key points in ${ready[0].name}?`);
  }
  if (prompts.length < limit && ready[1]) {
    prompts.push(`Compare ${ready[0]!.name} and ${ready[1].name}`);
  }
  if (prompts.length < limit && ready[0]) {
    prompts.push(`What questions can I ask about ${ready[0].name}?`);
  }
  return [...new Set(prompts)].slice(0, limit);
}
