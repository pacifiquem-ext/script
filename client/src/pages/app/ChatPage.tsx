import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { MessageCitation, PublicDocument, PublicMessage } from '@script/shared';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { MarkdownContent } from '../../components/ui/MarkdownContent';
import { uniqueSourceChips } from '../../lib/citations';
import { notify } from '../../components/ui/toast-alert';
import {
  appendMessageToCache,
  streamMessage,
  useChatMutations,
  useCredits,
  useMessages,
} from '../../lib/chat-api';
import { useDocument, useDocuments } from '../../lib/library-api';
import { getErrorMessage } from '../../lib/form-errors';
import { queryKeys } from '../../lib/query-client';

export function ChatPage() {
  const location = useLocation();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState('');
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [liveCitations, setLiveCitations] = useState<MessageCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{
    documentId: string;
    startOffset?: number | null;
    endOffset?: number | null;
    label?: string;
  } | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<PublicDocument[]>([]);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atIndex, setAtIndex] = useState(0);
  const handledInitial = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesQuery = useMessages(conversationId);
  const documentsQuery = useDocuments(null);
  const previewQuery = useDocument(preview?.documentId ?? null);
  const { createConversation, queryClient } = useChatMutations();
  const credits = useCredits();
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const readyDocs = useMemo(
    () => (documentsQuery.data ?? []).filter((d) => d.status === 'ready'),
    [documentsQuery.data],
  );
  const mentionOptions = useMemo(() => {
    if (atQuery === null) return [];
    const q = atQuery.toLowerCase();
    return readyDocs.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 8);
  }, [atQuery, readyDocs]);

  // Hide optimistic bubble once the real user message is in the cache.
  const showPendingUser = Boolean(
    pendingUser && !messages.some((m) => m.role === 'user' && m.content === pendingUser),
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, showPendingUser]);

  useEffect(() => {
    const state = location.state as { conversationId?: string } | null;
    if (state?.conversationId) setConversationId(state.conversationId);
  }, [location.state]);

  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    const created = await createConversation.mutateAsync(undefined);
    setConversationId(created.conversation.id);
    return created.conversation.id;
  }, [conversationId, createConversation]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(
    async (content: string, documentIds: string[] = selectedDocs.map((d) => d.id)) => {
      const trimmed = content.trim();
      if (!trimmed || loading) return;
      const pendingNotReady = documentIds.filter((id) => {
        const doc = selectedDocs.find((d) => d.id === id) ?? readyDocs.find((d) => d.id === id);
        return doc && doc.status !== 'ready';
      });
      if (pendingNotReady.length) {
        const message = 'Wait for mentioned documents to finish processing before chatting.';
        setError(message);
        notify.warning(message, 'Documents not ready');
        return;
      }
      setError(null);
      setLoading(true);
      setStreaming('');
      setLiveCitations([]);
      setPendingUser(trimmed);
      setInput('');
      const controller = new AbortController();
      abortRef.current = controller;
      let activeConversationId: string | null = conversationId;
      try {
        const id = await ensureConversation();
        activeConversationId = id;
        await streamMessage(id, trimmed, documentIds, {
          signal: controller.signal,
          onUserMessage: (message) => {
            appendMessageToCache(queryClient, id, message);
            setPendingUser(null);
          },
          onDelta: (delta) => setStreaming((prev) => prev + delta),
          onCitations: (citations) => setLiveCitations(citations),
          onDone: (message) => {
            appendMessageToCache(queryClient, id, message);
            setStreaming('');
            setLiveCitations([]);
          },
        });
        setStreaming('');
        setPendingUser(null);
        setLiveCitations([]);
        setAtQuery(null);
        // Soft background refresh — do not await (avoids empty-state flicker).
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversations('current'),
          refetchType: 'active',
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.credits('current'),
          refetchType: 'active',
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setError('Generation stopped.');
          notify.info('Generation stopped.', 'Stopped');
          // Server may have saved a partial assistant message — reconcile once.
          if (activeConversationId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.messages(activeConversationId),
            });
          }
        } else {
          const message = getErrorMessage(err, 'Failed to send message');
          setError(message);
          notify.error(message);
        }
        setStreaming('');
        setPendingUser(null);
        setLiveCitations([]);
        if (activeConversationId) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.credits('current') });
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [conversationId, ensureConversation, loading, queryClient, readyDocs, selectedDocs],
  );

  useEffect(() => {
    if (handledInitial.current) return;
    const state = location.state as { initialMessage?: string; documentIds?: string[] } | null;
    if (state?.initialMessage) {
      handledInitial.current = true;
      void send(state.initialMessage, state.documentIds ?? []);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, send]);

  function onInputChange(value: string, cursor: number) {
    setInput(value);
    const before = value.slice(0, cursor);
    const match = before.match(/@([^\n@]*)$/);
    if (match) {
      setAtQuery(match[1] ?? '');
      setAtIndex(0);
    } else {
      setAtQuery(null);
    }
  }

  function insertMention(doc: PublicDocument) {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const after = input.slice(cursor);
    const replaced = before.replace(/@([^\n@]*)$/, `@${doc.name} `);
    setInput(`${replaced}${after}`);
    setSelectedDocs((prev) => (prev.some((p) => p.id === doc.id) ? prev : [...prev, doc]));
    setAtQuery(null);
    requestAnimationFrame(() => {
      const pos = replaced.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function onDropChat(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData('application/x-script-document-id');
    const name = e.dataTransfer.getData('application/x-script-document-name');
    if (!id) return;
    const doc = readyDocs.find((d) => d.id === id) ?? {
      id,
      name: name || id,
      folderId: null,
      mimeType: 'application/octet-stream',
      byteSize: 0,
      source: 'local' as const,
      sourceUrl: null,
      status: 'ready' as const,
      processingPhase: null,
      failureReason: null,
      pageCount: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      processedAt: null,
    };
    setSelectedDocs((prev) => (prev.some((p) => p.id === doc.id) ? prev : [...prev, doc]));
    setInput((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}@${doc.name} `);
  }

  function openCitation(citation: MessageCitation, index1Based?: number) {
    const hasRange =
      citation.startOffset != null &&
      citation.endOffset != null &&
      citation.endOffset > citation.startOffset;
    setPreview({
      documentId: citation.documentId,
      startOffset: hasRange ? citation.startOffset : null,
      endOffset: hasRange ? citation.endOffset : null,
      label:
        index1Based != null
          ? `Source [${index1Based}] · ${citation.documentName}`
          : citation.documentName,
    });
  }

  function renderCitations(citations: MessageCitation[]) {
    const chips = uniqueSourceChips(citations);
    if (!chips.length) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {chips.map((chip) => (
          <button
            type="button"
            key={chip.documentId}
            className="text-[11px] px-2 py-0.5 rounded-full border border-primary-base/20 bg-primary-alpha-10 text-primary-base hover:bg-primary-base hover:text-white transition-colors"
            onClick={() => openCitation(chip.best, chip.indices[0])}
            title={
              chip.best.score != null
                ? `${chip.documentName} · refs ${chip.indices.map((n) => `[${n}]`).join(' ')} · relevance ${(chip.best.score * 100).toFixed(0)}%`
                : `${chip.documentName} · refs ${chip.indices.map((n) => `[${n}]`).join(' ')}`
            }
          >
            <span>{chip.documentName}</span>
            {chip.indices.length > 1 ? (
              <span className="ml-1 opacity-70">×{chip.indices.length}</span>
            ) : (
              <span className="ml-1 opacity-70">[{chip.indices[0]}]</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  function renderMessageBody(message: PublicMessage) {
    if (message.role === 'assistant') {
      const citations = message.citations ?? [];
      return (
        <>
          <MarkdownContent
            content={message.content}
            compact
            citations={citations}
            onCitationClick={(citation, index) => openCitation(citation, index)}
          />
          {message.partial ? (
            <p className="mt-1 text-[11px] text-neutral-400">Stopped early</p>
          ) : null}
          {renderCitations(citations)}
        </>
      );
    }
    return <p className="whitespace-pre-wrap m-0">{message.content}</p>;
  }


  const showInitialLoading = messagesQuery.isLoading && !messagesQuery.data && !pendingUser;

  return (
    <div className="flex h-full overflow-hidden bg-white">
      <div
        className="flex-1 flex flex-col min-w-0"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropChat}
      >
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {showInitialLoading ? (
            <LoadingState label="Loading conversation…" />
          ) : messagesQuery.isError ? (
            <EmptyState
              title="Couldn’t load messages"
              description={getErrorMessage(messagesQuery.error, 'Try again in a moment.')}
            />
          ) : messages.length === 0 && !streaming && !showPendingUser ? (
            <EmptyState
              title="Chat with your library"
              description="Type @ to mention ready documents, or drag a file chip from the list below."
            />
          ) : null}
          {messages.map((message: PublicMessage) => (
            <div
              key={message.id}
              className={`max-w-[80%] rounded-16 px-4 py-3 text-para-sm ${
                message.role === 'user'
                  ? 'ml-auto bg-primary-alpha-10 text-neutral-950'
                  : 'bg-neutral-50 text-neutral-800'
              }`}
            >
              {renderMessageBody(message)}
            </div>
          ))}
          {showPendingUser && pendingUser ? (
            <div className="max-w-[80%] ml-auto rounded-16 px-4 py-3 text-para-sm whitespace-pre-wrap bg-primary-alpha-10 text-neutral-950">
              {pendingUser}
            </div>
          ) : null}
          {(streaming || (loading && !streaming)) && (
            <div className="max-w-[80%] rounded-16 px-4 py-3 text-para-sm bg-neutral-50 text-neutral-800">
              {streaming ? (
                <MarkdownContent
                  content={streaming}
                  compact
                  citations={liveCitations}
                  onCitationClick={(citation, index) => openCitation(citation, index)}
                />
              ) : (
                <span className="text-neutral-500 animate-pulse">Thinking…</span>
              )}
              {renderCitations(liveCitations)}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-neutral-200 p-4 flex flex-col gap-2 relative">
          {mentionOptions.length > 0 && (
            <div
              className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-neutral-200 rounded-12 shadow-lg p-1 z-10 max-h-48 overflow-y-auto"
              role="listbox"
            >
              {mentionOptions.map((doc, i) => (
                <button
                  type="button"
                  key={doc.id}
                  role="option"
                  aria-selected={i === atIndex}
                  className={`w-full text-left px-3 py-2 rounded-8 text-para-sm ${i === atIndex ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(doc);
                  }}
                >
                  {doc.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {readyDocs.slice(0, 12).map((doc) => {
              const active = selectedDocs.some((s) => s.id === doc.id);
              return (
                <button
                  type="button"
                  key={doc.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-script-document-id', doc.id);
                    e.dataTransfer.setData('application/x-script-document-name', doc.name);
                  }}
                  className={`text-[11px] px-2 py-1 rounded-full border ${active ? 'bg-primary-base text-white border-primary-base' : 'border-neutral-200 text-neutral-600'}`}
                  onClick={() =>
                    setSelectedDocs((prev) =>
                      active ? prev.filter((p) => p.id !== doc.id) : [...prev, doc],
                    )
                  }
                >
                  {doc.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-para-xs text-neutral-500 gap-2">
            <span>
              Credits:{' '}
              <span className="text-primary-base font-semibold">
                {credits.data?.balance?.toLocaleString() ?? '—'}
              </span>
            </span>
          </div>
          {error ? (
            <Alert
              status="error"
              variant="stroke"
              compact
              title={
                error.toLowerCase().includes('insufficient credits')
                  ? 'Insufficient credits'
                  : 'Chat error'
              }
              description={
                error.toLowerCase().includes('insufficient credits')
                  ? 'Insufficient credits for this reply.'
                  : error
              }
              onDismiss={() => setError(null)}
            />
          ) : null}
          <div className="flex gap-2 flex-col sm:flex-row">
            <textarea
              ref={textareaRef}
              className="flex-1 min-h-[60px] max-h-[160px] p-3 border border-neutral-200 rounded-12 text-para-sm outline-none focus:border-primary-base resize-y"
              placeholder="Ask about your documents… use @ to mention"
              value={input}
              aria-label="Chat message"
              disabled={loading}
              onChange={(e) =>
                onInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
              }
              onKeyDown={(e) => {
                if (mentionOptions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setAtIndex((i) => (i + 1) % mentionOptions.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setAtIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length);
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    insertMention(mentionOptions[atIndex]!);
                    return;
                  }
                  if (e.key === 'Escape') {
                    setAtQuery(null);
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            {loading ? (
              <Button size="sm" variant="neutral" onClick={stopStreaming}>
                Stop
              </Button>
            ) : (
              <Button size="sm" loading={loading} onClick={() => void send(input)}>
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
      {preview && (
        <DocumentCanvas
          file={{
            id: preview.documentId,
            name: previewQuery.data?.name || 'Document',
            status: previewQuery.data?.status,
            mimeType: previewQuery.data?.mimeType,
          }}
          content={previewQuery.data?.extractedText ?? null}
          downloadUrl={previewQuery.data?.downloadUrl ?? null}
          loading={previewQuery.isLoading}
          highlight={
            preview.startOffset != null &&
            preview.endOffset != null &&
            preview.endOffset > preview.startOffset
              ? {
                  startOffset: preview.startOffset,
                  endOffset: preview.endOffset,
                  label: preview.label,
                }
              : null
          }
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
