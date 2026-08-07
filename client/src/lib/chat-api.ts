import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageCitation, PublicConversation, PublicMessage } from '@script/shared';
import { apiRequest, getApiBaseUrl } from './api-client';
import { queryKeys } from './query-client';

export function useConversations(enabled = true, search?: string) {
  const q = search?.trim() ?? '';
  return useQuery({
    queryKey: [...queryKeys.conversations('current'), q],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      if (q) params.set('q', q);
      return apiRequest<{
        groups: Array<{ group: string; items: PublicConversation[] }>;
        conversations: PublicConversation[];
        data: PublicConversation[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>(`/conversations?${params.toString()}`);
    },
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? queryKeys.messages(conversationId) : ['messages', 'none'],
    enabled: Boolean(conversationId),
    staleTime: 60_000,
    queryFn: async () => {
      const data = await apiRequest<{ data: PublicMessage[]; messages?: PublicMessage[] }>(
        `/conversations/${conversationId}/messages?page=1&pageSize=100`,
      );
      return data.data ?? data.messages ?? [];
    },
  });
}

export function appendMessageToCache(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  message: PublicMessage,
) {
  queryClient.setQueryData<PublicMessage[]>(queryKeys.messages(conversationId), (old) => {
    const list = old ?? [];
    if (list.some((m) => m.id === message.id)) {
      return list.map((m) => (m.id === message.id ? message : m));
    }
    return [...list, message];
  });
}

export function useChatMutations() {
  const queryClient = useQueryClient();
  const invalidateConversations = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.conversations('current') });
  };
  const createConversation = useMutation({
    mutationFn: (title?: string) =>
      apiRequest<{ conversation: PublicConversation }>('/conversations', {
        method: 'POST',
        body: title ? { title } : {},
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.messages(data.conversation.id), [] as PublicMessage[]);
      void invalidateConversations();
    },
  });
  const renameConversation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest<{ conversation: PublicConversation }>(`/conversations/${id}`, {
        method: 'PATCH',
        body: { title },
      }),
    onSuccess: invalidateConversations,
  });
  const deleteConversation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: true }>(`/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.messages(id) });
      void invalidateConversations();
    },
  });
  return { createConversation, renameConversation, deleteConversation, queryClient };
}

export type WriteConfirmEvent = {
  type: 'write_confirm';
  tool: string;
  confirmToken: string;
  runId: string;
  stepKey: string;
  summary?: string;
};

export type StreamHandlers = {
  onUserMessage?: (message: PublicMessage) => void;
  onCitations?: (citations: MessageCitation[]) => void;
  onToolCall?: (name: string, input?: unknown, statusLabel?: string) => void;
  onToolResult?: (name: string, ok: boolean) => void;
  onWriteConfirm?: (event: WriteConfirmEvent) => void;
  onDelta: (text: string) => void;
  onDone?: (message: PublicMessage) => void;
  signal?: AbortSignal;
};

export async function streamMessage(
  conversationId: string,
  content: string,
  documentIds: string[],
  handlers: StreamHandlers | ((text: string) => void),
): Promise<PublicMessage | null> {
  const opts: StreamHandlers = typeof handlers === 'function' ? { onDelta: handlers } : handlers;
  const response = await fetch(`${getApiBaseUrl()}/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, documentIds }),
    signal: opts.signal,
  });
  if (!response.ok || !response.body) {
    let message = 'Failed to stream chat response';
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneMessage: PublicMessage | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6)) as
        | { type: 'user_message'; message: PublicMessage }
        | { type: 'citations'; citations: MessageCitation[] }
        | { type: 'tool_call'; name: string; input?: unknown; statusLabel?: string }
        | { type: 'tool_result'; name: string; ok: boolean }
        | WriteConfirmEvent
        | { type: 'delta'; text: string }
        | { type: 'done'; message: PublicMessage }
        | { type: 'error'; code?: string; message?: string };
      if (payload.type === 'user_message') opts.onUserMessage?.(payload.message);
      if (payload.type === 'citations') opts.onCitations?.(payload.citations);
      if (payload.type === 'tool_call')
        opts.onToolCall?.(payload.name, payload.input, payload.statusLabel);
      if (payload.type === 'tool_result') opts.onToolResult?.(payload.name, payload.ok);
      if (payload.type === 'write_confirm') opts.onWriteConfirm?.(payload);
      if (payload.type === 'delta' && payload.text) opts.onDelta(payload.text);
      if (payload.type === 'done') {
        doneMessage = payload.message;
        opts.onDone?.(payload.message);
      }
      if (payload.type === 'error') {
        throw new Error(payload.message || 'Chat failed');
      }
    }
  }
  return doneMessage;
}

export function useCredits(enabled = true) {
  return useQuery({
    queryKey: queryKeys.credits('current'),
    enabled,
    staleTime: 30_000,
    queryFn: async () => apiRequest<{ balance: number; plan: string }>('/credits'),
    // Was 10s — too chatty; balance only changes after AI actions.
    refetchInterval: 60_000,
  });
}
