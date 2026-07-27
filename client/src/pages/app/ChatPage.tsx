import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { MessageCitation, PublicDocument, PublicMessage } from '@script/shared';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { MarkdownContent } from '../../components/ui/MarkdownContent';
import { ResizeHandle } from '../../components/ui/ResizeHandle';
import { useResizableWidth } from '../../lib/use-resizable-width';
import { uniqueSourceChips } from '../../lib/citations';
import { notify } from '../../components/ui/toast-alert';
import {
  appendMessageToCache,
  streamMessage,
  useChatMutations,
  useCredits,
  useMessages,
} from '../../lib/chat-api';
import {
  buildDocumentPrompts,
  matchDocumentsInText,
  useDocument,
  useDocuments,
  useFolders,
} from '../../lib/library-api';
import { getErrorMessage } from '../../lib/form-errors';
import { queryKeys } from '../../lib/query-client';
import {
  IconArrowUp,
  IconAttach,
  IconDocFile,
  IconFile,
  IconSparkles,
  IconZap,
} from '../../lib/icons';

const TYPE_DOT: Record<string, string> = {
  pdf: '#e54d2e',
  doc: '#0070f3',
  xls: '#1a7f3c',
  txt: '#737373',
  other: '#737373',
};

function mimeKind(mime: string, name: string): string {
  const m = (mime || '').toLowerCase();
  const n = name.toLowerCase();
  if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
  if (m.includes('word') || m.includes('msword') || n.endsWith('.doc') || n.endsWith('.docx'))
    return 'doc';
  if (
    m.includes('sheet') ||
    m.includes('excel') ||
    n.endsWith('.xls') ||
    n.endsWith('.xlsx') ||
    n.endsWith('.csv')
  )
    return 'xls';
  if (m.startsWith('text/') || n.endsWith('.txt') || n.endsWith('.md')) return 'txt';
  return 'other';
}

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
    documentName: string;
    versionId?: string | null;
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
  // pageSize 100 so files in nested folders still appear for @ and name matching.
  const documentsQuery = useDocuments(null, true, { pageSize: 100 });
  const foldersQuery = useFolders(null);
  const previewQuery = useDocument(preview?.documentId ?? null, {
    versionId: preview?.versionId,
  });
  const { createConversation, queryClient } = useChatMutations();
  const credits = useCredits();
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const allDocs = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
  const readyDocs = useMemo(() => allDocs.filter((d) => d.status === 'ready'), [allDocs]);
  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of foldersQuery.data ?? []) map.set(f.id, f.name);
    return map;
  }, [foldersQuery.data]);
  const suggestedPrompts = useMemo(() => buildDocumentPrompts(allDocs, 4), [allDocs]);
  const mentionOptions = useMemo(() => {
    if (atQuery === null) return [];
    const q = atQuery.toLowerCase();
    // Prefer ready docs first, but surface non-ready so folder uploads aren't "invisible".
    return [...allDocs]
      .filter((d) => d.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.status === 'ready' && b.status !== 'ready') return -1;
        if (a.status !== 'ready' && b.status === 'ready') return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [atQuery, allDocs]);

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
    async (content: string, documentIds?: string[]) => {
      const trimmed = content.trim();
      if (!trimmed || loading) return;

      const named = matchDocumentsInText(trimmed, allDocs);
      const explicit =
        documentIds ??
        selectedDocs.map((d) => d.id);
      // Merge chip selections with names typed in the message (incl. files in folders).
      const mergedIds = [
        ...new Set([
          ...explicit,
          ...named.filter((d) => d.status === 'ready').map((d) => d.id),
        ]),
      ];

      const notReadyNamed = named.filter((d) => d.status !== 'ready');
      const notReadyExplicit = mergedIds
        .map((id) => allDocs.find((d) => d.id === id) ?? selectedDocs.find((d) => d.id === id))
        .filter((d): d is PublicDocument => Boolean(d && d.status !== 'ready'));
      const blocked = [...notReadyNamed, ...notReadyExplicit].filter(
        (d, i, arr) => arr.findIndex((x) => x.id === d.id) === i,
      );

      // If the user only pointed at non-ready files (by name or chip), stop early.
      if (blocked.length && mergedIds.every((id) => blocked.some((b) => b.id === id))) {
        const first = blocked[0]!;
        const message =
          first.status === 'failed'
            ? `"${first.name}" failed processing${first.failureReason ? `: ${first.failureReason.slice(0, 140)}` : ''}. Open Library → file menu → Retry.`
            : `Wait for ${blocked.map((d) => d.name).join(', ')} to finish processing before chatting.`;
        setError(message);
        notify.warning(message, 'Documents not ready');
        return;
      }
      if (blocked.length && named.length && !named.some((d) => d.status === 'ready')) {
        const first = blocked[0]!;
        const message =
          first.status === 'failed'
            ? `"${first.name}" is not searchable yet (processing failed). Retry it from the library.`
            : `"${first.name}" is still ${first.status}. Try again when it is ready.`;
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
        await streamMessage(id, trimmed, mergedIds, {
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
    [allDocs, conversationId, ensureConversation, loading, queryClient, selectedDocs],
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
    if (doc.status !== 'ready') {
      const message =
        doc.status === 'failed'
          ? `"${doc.name}" failed processing — open Library and choose Retry before chatting.`
          : `"${doc.name}" is still ${doc.status}. Wait until it is ready.`;
      notify.warning(message, 'Document not ready');
      setAtQuery(null);
      return;
    }
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
      currentVersionId: null,
      currentVersionNumber: null,
      isUpdating: false,
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
      documentName: citation.documentName,
      versionId: citation.documentVersionId ?? null,
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
  const isEmpty = messages.length === 0 && !streaming && !showPendingUser && !showInitialLoading;
  const previewListDocument = preview
    ? allDocs.find((doc) => doc.id === preview.documentId)
    : undefined;
  const previewLoading =
    Boolean(preview) && !previewQuery.data && (previewQuery.isLoading || previewQuery.isFetching);
  const previewPanel = useResizableWidth({
    storageKey: 'script.chatPreviewWidth',
    defaultWidth: 480,
    minWidth: 280,
    maxWidth: 900,
  });

  return (
    <div className="flex h-full overflow-hidden bg-white relative">
      <div
        className="flex-1 flex flex-col min-w-0 relative h-full"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropChat}
      >
        <div
          className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.neutral.200)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.neutral.200)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none z-0"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_110%_55%_at_50%_0%,transparent_0%,theme(colors.neutral.0)_72%)] pointer-events-none z-10"
          aria-hidden
        />

        <div className="flex-1 overflow-y-auto p-[24px_16px] relative z-20">
          <div className="max-w-[720px] mx-auto flex flex-col gap-5">
            {showInitialLoading ? (
              <LoadingState label="Loading conversation…" />
            ) : messagesQuery.isError ? (
              <EmptyState
                title="Couldn’t load messages"
                description={getErrorMessage(messagesQuery.error, 'Try again in a moment.')}
              />
            ) : isEmpty ? (
              <div className="flex flex-col items-center text-center p-[80px_24px] gap-4">
                <div className="w-14 h-14 bg-neutral-50 rounded-16 border border-neutral-200 flex items-center justify-center text-neutral-400">
                  <IconFile size={28} />
                </div>
                <h2 className="text-h6 text-neutral-950 m-0">Ask about your documents</h2>
                <p className="text-para-sm text-neutral-600 max-w-[400px] leading-[1.7] m-0">
                  Upload a document or open one from your library.
                  <br />
                  Extract details, find information, and get answers instantly.
                </p>
                <div className="flex flex-wrap gap-2 justify-center w-full max-w-[560px] mt-2">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      type="button"
                      key={prompt}
                      className="px-3.5 py-[7px] bg-white border border-neutral-200 rounded-full text-neutral-600 cursor-pointer font-sans text-[13px] transition-colors duration-200 text-para-sm hover:bg-neutral-50 hover:text-neutral-950 hover:border-neutral-300"
                      onClick={() => void send(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                {!readyDocs.length && allDocs.some((d) => d.status === 'failed') ? (
                  <p className="text-para-xs text-neutral-500 m-0 max-w-[420px]">
                    Some uploads failed processing (often embedding rate limits). Open Library, open
                    the file menu, and choose Retry once they are ready for chat.
                  </p>
                ) : null}
              </div>
            ) : null}

            {messages.map((message: PublicMessage) => (
              <div
                key={message.id}
                className={`max-w-[80%] rounded-16 px-4 py-3 text-para-sm ${
                  message.role === 'user'
                    ? 'ml-auto bg-primary-alpha-10 text-neutral-950'
                    : 'bg-white shadow-[inset_0_0_0_1px_theme(colors.neutral.200)] text-neutral-800'
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
              <div className="flex gap-3 items-end max-w-[80%]">
                <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 bg-neutral-950 text-white">
                  <IconSparkles size={13} />
                </div>
                <div className="rounded-16 rounded-bl-4 px-4 py-3 text-para-sm bg-white shadow-[inset_0_0_0_1px_theme(colors.neutral.200)] text-neutral-800 min-w-0">
                  {streaming ? (
                    <MarkdownContent
                      content={streaming}
                      compact
                      citations={liveCitations}
                      onCitationClick={(citation, index) => openCitation(citation, index)}
                    />
                  ) : (
                    <div className="flex items-center gap-1 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse [animation-delay:0.4s]" />
                    </div>
                  )}
                  {renderCitations(liveCitations)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="p-[16px_16px_20px] bg-transparent flex flex-col items-center gap-2 relative z-20">
          <div className="w-full max-w-[720px] relative flex flex-col">
            {mentionOptions.length > 0 && (
              <div
                className="absolute bottom-[calc(100%+8px)] left-0 right-0 bg-white rounded-12 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.xl)] p-2 max-h-[260px] overflow-y-auto z-10"
                role="listbox"
              >
                <p className="text-subheading-md text-neutral-400 tracking-[0.06em] p-[4px_8px_6px] m-0">
                  Files
                </p>
                {mentionOptions.map((doc, i) => {
                  const kind = mimeKind(doc.mimeType, doc.name);
                  const folderLabel = doc.folderId
                    ? folderNameById.get(doc.folderId) ?? 'Folder'
                    : null;
                  const ready = doc.status === 'ready';
                  return (
                    <button
                      type="button"
                      key={doc.id}
                      role="option"
                      aria-selected={i === atIndex}
                      className={`flex items-center gap-2.5 w-full p-[7px_8px] bg-transparent border-none cursor-pointer font-sans rounded-8 text-left transition-colors duration-200 ${i === atIndex ? 'bg-neutral-50' : 'hover:bg-neutral-50'} ${ready ? '' : 'opacity-70'}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(doc);
                      }}
                    >
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded-4 text-[9px] font-bold tracking-[0.05em] text-white"
                        style={{ background: TYPE_DOT[kind] || TYPE_DOT.other }}
                      >
                        {kind.toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="text-para-sm text-neutral-950 overflow-hidden text-ellipsis whitespace-nowrap">
                          {doc.name}
                        </span>
                        <span className="text-[11px] text-neutral-400 truncate">
                          {folderLabel ? `${folderLabel} · ` : ''}
                          {ready
                            ? 'Ready'
                            : doc.status === 'failed'
                              ? 'Failed — retry in Library'
                              : doc.status}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {error ? (
              <div className="mb-2">
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
              </div>
            ) : null}

            <div className="w-full bg-neutral-50 rounded-[20px] p-[6px_6px_8px] flex flex-col gap-1.5 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.lg)] transition-shadow duration-200 focus-within:shadow-[0_0_0_1.5px_theme(colors.neutral.300),theme(boxShadow.lg)]">
              <div className="flex items-center gap-2 px-3 pt-1 pb-1 flex-wrap">
                <IconZap size={14} className="text-neutral-400" />
                <span className="text-[13px] text-neutral-600 font-medium">
                  You are remaining with{' '}
                  <span className="text-primary-base font-semibold">
                    {credits.data?.balance?.toLocaleString() ?? '—'}
                  </span>{' '}
                  credits
                </span>
              </div>

              <div className="bg-white rounded-[14px] shadow-sm border border-neutral-200 flex flex-col overflow-hidden relative">
                <textarea
                  ref={textareaRef}
                  className="flex-1 border-none outline-none resize-none bg-transparent font-sans text-neutral-950 leading-[1.6] min-h-[60px] max-h-[200px] overflow-y-auto p-[8px_16px] placeholder:text-neutral-400 text-para-md disabled:opacity-60"
                  placeholder="Ask about your documents… use @ to mention"
                  value={input}
                  aria-label="Chat message"
                  disabled={loading}
                  onChange={(e) => {
                    onInputChange(
                      e.target.value,
                      e.target.selectionStart ?? e.target.value.length,
                    );
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
                    }
                  }}
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
                  rows={2}
                />
                <div className="flex items-center justify-between p-[8px_12px_12px_12px] gap-2">
                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                    <button
                      type="button"
                      className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 hover:text-neutral-600 hover:bg-neutral-200"
                      aria-label="Mention a document"
                      title="Type @ to mention a document"
                      onClick={() => {
                        const el = textareaRef.current;
                        const next = `${input}${input.endsWith(' ') || !input ? '' : ' '}@`;
                        setInput(next);
                        setAtQuery('');
                        setAtIndex(0);
                        requestAnimationFrame(() => {
                          el?.focus();
                          const pos = next.length;
                          el?.setSelectionRange(pos, pos);
                        });
                      }}
                    >
                      <IconAttach size={17} />
                    </button>
                    {selectedDocs.map((doc) => {
                      const kind = mimeKind(doc.mimeType, doc.name);
                      return (
                        <span
                          key={doc.id}
                          className="inline-flex items-center gap-[5px] px-[8px] py-[3px] bg-white border border-neutral-200 rounded-full text-[11px] font-medium text-neutral-600 whitespace-nowrap max-w-[180px] overflow-hidden"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: TYPE_DOT[kind] || TYPE_DOT.other }}
                          />
                          <IconDocFile size={12} />
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                            {doc.name}
                          </span>
                          <button
                            type="button"
                            className="ml-0.5 p-0 bg-transparent border-none cursor-pointer text-neutral-400 hover:text-neutral-700 text-[11px] leading-none"
                            aria-label={`Remove ${doc.name}`}
                            onClick={() =>
                              setSelectedDocs((prev) => prev.filter((d) => d.id !== doc.id))
                            }
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                    {readyDocs.slice(0, 6).map((doc) => {
                      if (selectedDocs.some((s) => s.id === doc.id)) return null;
                      return (
                        <button
                          type="button"
                          key={`chip-${doc.id}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-script-document-id', doc.id);
                            e.dataTransfer.setData('application/x-script-document-name', doc.name);
                          }}
                          className="hidden sm:inline-flex text-[10px] px-2 py-0.5 rounded-full border border-dashed border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 cursor-pointer bg-transparent max-w-[120px] truncate"
                          onClick={() =>
                            setSelectedDocs((prev) =>
                              prev.some((p) => p.id === doc.id) ? prev : [...prev, doc],
                            )
                          }
                          title={`Attach ${doc.name}`}
                        >
                          + {doc.name}
                        </button>
                      );
                    })}
                  </div>
                  {loading ? (
                    <Button size="xs" variant="neutral" mode="stroke" onClick={stopStreaming}>
                      Stop
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className={`flex items-center justify-center w-8 h-8 border-none rounded-8 cursor-pointer transition-all duration-200 shrink-0 ${
                        input.trim()
                          ? 'bg-primary-base text-white hover:bg-primary-darker hover:scale-105'
                          : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                      }`}
                      onClick={() => void send(input)}
                      disabled={!input.trim() || loading}
                      aria-label="Send"
                    >
                      <IconArrowUp size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-neutral-400 text-center max-w-[700px] leading-[1.6] mt-2 mb-0">
            Script AI only provides insights based on your uploaded documents.
          </p>
        </div>
      </div>
      {preview ? (
        <>
          <ResizeHandle
            growth="left"
            label="Resize document preview"
            onResizeStart={previewPanel.beginResize}
          />
          <div
            className="h-full shrink-0 min-w-0 overflow-hidden"
            style={{ width: previewPanel.width }}
          >
            <DocumentCanvas
              file={{
                id: preview.documentId,
                name: previewQuery.data?.name ?? previewListDocument?.name ?? preview.documentName,
                status: previewQuery.data?.status ?? previewListDocument?.status,
                mimeType: previewQuery.data?.mimeType ?? previewListDocument?.mimeType,
              }}
              content={previewQuery.data?.extractedText ?? null}
              downloadUrl={previewQuery.data?.downloadUrl ?? null}
              loading={previewLoading}
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
              className="h-full w-full min-h-0 border-l border-neutral-200"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
