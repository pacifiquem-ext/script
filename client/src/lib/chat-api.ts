import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicConversation, PublicMessage } from '@script/shared';
import { apiRequest, getApiBaseUrl } from './api-client';
import { queryKeys } from './query-client';

export function useConversations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.conversations('current'),
    enabled,
    queryFn: async () =>
      apiRequest<{
        groups: Array<{ group: string; items: PublicConversation[] }>;
        conversations: PublicConversation[];
      }>('/conversations'),
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? queryKeys.messages(conversationId) : ['messages', 'none'],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const data = await apiRequest<{ messages: PublicMessage[] }>(
        `/conversations/${conversationId}/messages`,
      );
      return data.messages;
    },
  });
}

export function useChatMutations() {
  const queryClient = useQueryClient();
  const createConversation = useMutation({
    mutationFn: (title?: string) =>
      apiRequest<{ conversation: PublicConversation }>('/conversations', {
        method: 'POST',
        body: title ? { title } : {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations('current') });
    },
  });
  return { createConversation, queryClient };
}

export async function streamMessage(
  conversationId: string,
  content: string,
  documentIds: string[],
  onDelta: (text: string) => void,
): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, documentIds }),
  });
  if (!response.ok || !response.body) {
    throw new Error('Failed to stream chat response');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6)) as {
        type: string;
        text?: string;
        message?: string;
      };
      if (payload.type === 'delta' && payload.text) onDelta(payload.text);
      if (payload.type === 'error') throw new Error(payload.message || 'Chat failed');
    }
  }
}

export function useCredits(enabled = true) {
  return useQuery({
    queryKey: queryKeys.credits('current'),
    enabled,
    queryFn: async () => apiRequest<{ balance: number; plan: string }>('/credits'),
    refetchInterval: 10000,
  });
}
