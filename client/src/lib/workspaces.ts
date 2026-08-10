import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicMember, PublicWorkspace } from '@script/shared';
import { apiRequest } from './api-client';
import { queryKeys } from './query-client';

export function useWorkspaces(enabled = true) {
  return useQuery({
    queryKey: queryKeys.workspaces,
    enabled,
    queryFn: async () => {
      const data = await apiRequest<{ workspaces: PublicWorkspace[] }>('/workspaces');
      return data.workspaces;
    },
  });
}

export function useWorkspaceMembers(enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.workspaces, 'members'],
    enabled,
    queryFn: async () => {
      const data = await apiRequest<{ members: PublicMember[] }>('/workspaces/current/members');
      return data.members;
    },
  });
}

export function useSwitchWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const data = await apiRequest<{ workspace: PublicWorkspace }>('/workspaces/switch', {
        method: 'POST',
        body: { workspaceId },
      });
      return data.workspace;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const data = await apiRequest<{ workspace: PublicWorkspace }>('/workspaces', {
        method: 'POST',
        body: { name },
      });
      return data.workspace;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useRenameWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const data = await apiRequest<{ workspace: PublicWorkspace }>('/workspaces/current', {
        method: 'PATCH',
        body: { name },
      });
      return data.workspace;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
