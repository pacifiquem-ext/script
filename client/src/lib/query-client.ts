import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  session: ['session'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspaces', id] as const,
  folders: (workspaceId: string) => ['folders', workspaceId] as const,
  documents: (workspaceId: string, folderId?: string | null) =>
    ['documents', workspaceId, folderId ?? 'root'] as const,
  document: (id: string) => ['documents', 'detail', id] as const,
  conversations: (workspaceId: string) => ['conversations', workspaceId] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  credits: (workspaceId: string) => ['credits', workspaceId] as const,
  integrations: ['integrations'] as const,
  cloudFiles: (provider: string, parentId: string | null) =>
    ['cloud-files', provider, parentId ?? 'root'] as const,
};
