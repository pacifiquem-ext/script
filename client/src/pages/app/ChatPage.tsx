import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { MessageCitation, PublicDocument, PublicMessage } from '@script/shared';
import voiceBubble from '../../assets/1440w/voice-bubble.png';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { MarkdownContent, CHAT_BODY_CLASS } from '../../components/ui/MarkdownContent';
import { ResizeHandle } from '../../components/ui/ResizeHandle';
import { useAuth } from '../../contexts/useAuth';
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
  IconZap,
} from '../../lib/icons';

const THINKING_PHRASES = [
  'Preparing…',
  'Noodling…',
  'Organizing thoughts…',
  'Synthesizing context…',
  'Reading your library…',
  'Connecting the dots…',
];

const CHAT_MESSAGE_TEXT = `${CHAT_BODY_CLASS} text-neutral-950 whitespace-pre-wrap m-0`;

function timeGreetingPrefix(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

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
  const { user } = useAuth();
  const displayName = user?.name ?? 'there';
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
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
  const [thinkingIndex, setThinkingIndex] = useState(0);
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
    if (!loading || streaming) return;
    const id = window.setInterval(() => {
      setThinkingIndex((index) => (index + 1) % THINKING_PHRASES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [loading, streaming]);

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
      <div className="mt-0 flex flex-wrap gap-1.5">
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

  function renderAssistantContent(
    content: string,
    citations: MessageCitation[],
    partial?: boolean,
  ) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-3 text-neutral-800">
        <MarkdownContent
          content={content}
          compact
          citations={citations}
          onCitationClick={(citation, index) => openCitation(citation, index)}
        />
        {partial ? <p className="mt-1 text-[11px] text-neutral-400">Stopped early</p> : null}
        {renderCitations(citations)}
      </div>
    );
  }

  function renderAssistantAvatar() {
    return (
      <div
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#E8EAFF]"
        aria-hidden
      >
        <img src={voiceBubble} alt="" className="h-[18px] w-[18px] object-contain" />
      </div>
    );
  }

  function renderComposer({ welcome = false }: { welcome?: boolean } = {}) {
    return (
      <div className="relative flex w-full max-w-[720px] flex-col">
        {mentionOptions.length > 0 && (
          <div
            className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-10 max-h-[260px] overflow-y-auto rounded-12 bg-white p-2 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.xl)]"
            role="listbox"
          >
            <p className="text-subheading-md text-neutral-400 tracking-[0.06em] p-[4px_8px_6px] m-0">
              Files
            </p>
            {mentionOptions.map((doc, i) => {
              const kind = mimeKind(doc.mimeType, doc.name);
              const folderLabel = doc.folderId
                ? (folderNameById.get(doc.folderId) ?? 'Folder')
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

        <div
          className={`flex w-full flex-col gap-1.5 rounded-[20px] p-[6px_6px_8px] transition-shadow duration-200 ${
            welcome
              ? 'bg-[#E8EAFF]'
              : 'bg-neutral-50 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.lg)] focus-within:shadow-[0_0_0_1.5px_theme(colors.neutral.300),theme(boxShadow.lg)]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 px-3 pt-1 pb-1">
            <IconZap size={14} className="text-neutral-400" />
            <span className="text-[13px] text-neutral-600 font-medium">
              You are remaining with{' '}
              <span className="text-primary-base font-semibold">
                {credits.data?.balance?.toLocaleString() ?? '—'}
              </span>{' '}
              credits
            </span>
          </div>

          <div className="relative flex flex-col overflow-hidden rounded-[14px] bg-white">
            <textarea
              ref={textareaRef}
              className="flex-1 border-none outline-none resize-none bg-transparent font-sans text-neutral-950 leading-[1.6] min-h-[60px] max-h-[200px] overflow-y-auto p-[8px_16px] placeholder:text-neutral-400 text-para-md disabled:opacity-60"
              placeholder="Ask about your documents… use @ to mention"
              value={input}
              aria-label="Chat message"
              disabled={loading}
              onChange={(e) => {
                onInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length);
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
                    setAtIndex(
                      (i) => (i - 1 + mentionOptions.length) % mentionOptions.length,
                    );
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
            <div className="flex items-center justify-between gap-2 p-[8px_12px_12px_12px]">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <button
                  type="button"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-8 border-none bg-transparent text-neutral-400 transition-colors duration-200 hover:bg-neutral-200 hover:text-neutral-600"
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
                      className="inline-flex max-w-[180px] items-center gap-[5px] overflow-hidden whitespace-nowrap rounded-full border border-neutral-200 bg-white px-[8px] py-[3px] text-[11px] font-medium text-neutral-600"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: TYPE_DOT[kind] || TYPE_DOT.other }}
                      />
                      <IconDocFile size={12} />
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {doc.name}
                      </span>
                      <button
                        type="button"
                        className="ml-0.5 cursor-pointer border-none bg-transparent p-0 text-[11px] leading-none text-neutral-400 hover:text-neutral-700"
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
                      className="hidden max-w-[120px] cursor-pointer truncate rounded-full border border-dashed border-neutral-200 bg-transparent px-2 py-0.5 text-[10px] text-neutral-400 hover:border-neutral-300 hover:text-neutral-700 sm:inline-flex"
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
                  className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-8 border-none transition-all duration-200 ${
                    input.trim()
                      ? 'bg-primary-base text-white hover:scale-105 hover:bg-primary-darker'
                      : 'cursor-not-allowed bg-neutral-100 text-neutral-400'
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
    );
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
    <div className="relative flex h-full overflow-hidden bg-white">
      <div
        className="relative flex h-full min-w-0 flex-1 flex-col"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropChat}
      >
        <div className="relative z-20 flex-1 overflow-y-auto p-[24px_16px]">
          {showInitialLoading ? (
            <LoadingState label="Loading conversation…" />
          ) : messagesQuery.isError ? (
            <EmptyState
              title="Couldn’t load messages"
              description={getErrorMessage(messagesQuery.error, 'Try again in a moment.')}
            />
          ) : isEmpty ? (
            <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col items-center justify-center gap-10 px-6 py-12 text-center">
              <img
                src={voiceBubble}
                alt=""
                className="h-32 w-32 object-contain md:h-36 md:w-36"
              />
              <h1 className="m-0 text-[28px] font-medium leading-[1.2] tracking-tight text-neutral-950 md:text-[32px]">
                {timeGreetingPrefix()},{' '}
                <span className="font-serif italic text-primary-base">{firstName}</span>
              </h1>
              {renderComposer({ welcome: true })}
              {!readyDocs.length && allDocs.some((d) => d.status === 'failed') ? (
                <p className="text-para-xs m-0 max-w-[420px] text-neutral-500">
                  Some uploads failed processing (often embedding rate limits). Open Library, open
                  the file menu, and choose Retry once they are ready for chat.
                </p>
              ) : null}
              <p className="text-[11px] m-0 max-w-[700px] text-center leading-[1.6] text-neutral-400">
                Script AI only provides insights based on your uploaded documents.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[720px] flex-col gap-8">
              {messages.map((message: PublicMessage) =>
                message.role === 'user' ? (
                  <div
                    key={message.id}
                    className="ml-auto max-w-[80%] rounded-16 bg-primary-alpha-10 px-4 py-3 text-neutral-950"
                  >
                    <p className={CHAT_MESSAGE_TEXT}>{message.content}</p>
                  </div>
                ) : (
                  <div key={message.id} className="flex max-w-[85%] gap-3">
                    {renderAssistantAvatar()}
                    {renderAssistantContent(message.content, message.citations ?? [], message.partial)}
                  </div>
                ),
              )}
              {showPendingUser && pendingUser ? (
                <div className="ml-auto max-w-[80%] rounded-16 bg-primary-alpha-10 px-4 py-3 text-neutral-950">
                  <p className={CHAT_MESSAGE_TEXT}>{pendingUser}</p>
                </div>
              ) : null}
              {(streaming || (loading && !streaming)) && (
                <div className="flex max-w-[85%] gap-3">
                  {renderAssistantAvatar()}
                  <div className="flex min-w-0 flex-1 flex-col gap-3 text-neutral-800">
                    {streaming ? (
                      renderAssistantContent(streaming, liveCitations)
                    ) : (
                      <p className={`${CHAT_BODY_CLASS} m-0 text-neutral-500`}>
                        {THINKING_PHRASES[thinkingIndex]}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {!isEmpty ? (
          <div className="relative z-20 flex flex-col items-center gap-2 bg-transparent p-[16px_16px_20px]">
            {renderComposer()}
            <p className="text-[11px] m-0 max-w-[700px] text-center leading-[1.6] text-neutral-400">
              Script AI only provides insights based on your uploaded documents.
            </p>
          </div>
        ) : null}
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
