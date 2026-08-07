import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  humanizeIngestionFailure,
  type MessageCitation,
  type PublicDocument,
  type PublicMessage,
} from '@script/shared';
import voiceBubble from '../../assets/1440w/voice-bubble.png';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { MarkdownContent, CHAT_BODY_CLASS } from '../../components/ui/MarkdownContent';
import { ResizeHandle } from '../../components/ui/ResizeHandle';
import { useAuth } from '../../contexts/useAuth';
import { useResizableWidth } from '../../lib/use-resizable-width';
import { citationContextHint, uniqueSourceChips } from '../../lib/citations';
import { notify } from '../../components/ui/toast-alert';
import {
  appendMessageToCache,
  streamMessage,
  useChatMutations,
  useCredits,
  useMessages,
  type WriteConfirmEvent,
} from '../../lib/chat-api';
import { confirmWriteConfirmation, rejectWriteConfirmation } from '../../lib/workflows-api';
import { matchDocumentsInText, useDocument, useDocuments, useFolders } from '../../lib/library-api';
import { getErrorMessage } from '../../lib/form-errors';
import { queryKeys } from '../../lib/query-client';
import { getTextareaCaretCoordinates, splitMentionSegments } from '../../lib/textarea-caret';
import {
  IconArrowUp,
  IconAttach,
  IconCheck,
  IconClose,
  IconDocument,
  IconMic,
  IconSearch,
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

const CAPABILITY_PROMPTS = [
  { prompt: 'Summarize this document', Icon: IconDocument },
  { prompt: 'Find key dates and numbers', Icon: IconSearch },
  { prompt: 'Extract action items', Icon: IconCheck },
] as const;

const CHAT_MESSAGE_TEXT = `${CHAT_BODY_CLASS} text-neutral-950 whitespace-pre-wrap m-0`;

/** Shared radius for attachment pills + toolbar buttons */
const COMPOSER_CHIP_RADIUS = 'rounded-[10px]';

function timeGreetingPrefix(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

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
  if (
    m.startsWith('image/') ||
    n.endsWith('.png') ||
    n.endsWith('.jpg') ||
    n.endsWith('.jpeg') ||
    n.endsWith('.gif') ||
    n.endsWith('.webp')
  )
    return 'img';
  if (m.startsWith('text/') || n.endsWith('.txt') || n.endsWith('.md')) return 'txt';
  return 'other';
}

const FILE_TYPE_EMOJI: Record<string, string> = {
  pdf: '📄',
  img: '🖼️',
  xls: '📊',
  doc: '📘',
  folder: '📂',
  txt: '📝',
  other: '📎',
};

function fileTypeEmoji(kind: string): string {
  return FILE_TYPE_EMOJI[kind] ?? FILE_TYPE_EMOJI.other!;
}

export function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const displayName = user?.name ?? 'there';
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState('');
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [liveCitations, setLiveCitations] = useState<MessageCitation[]>([]);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{
    documentId: string;
    documentName: string;
    versionId?: string | null;
    startOffset?: number | null;
    endOffset?: number | null;
    label?: string;
    hint?: string | null;
  } | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<PublicDocument[]>([]);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atIndex, setAtIndex] = useState(0);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [mentionAnchor, setMentionAnchor] = useState<{ top: number; left: number } | null>(null);
  const [writeConfirm, setWriteConfirm] = useState<WriteConfirmEvent | null>(null);
  const [writeConfirmLoading, setWriteConfirmLoading] = useState(false);
  const handledInitial = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
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

  const mentionNames = useMemo(() => {
    const names = new Set<string>();
    for (const doc of selectedDocs) names.add(doc.name);
    for (const doc of allDocs) names.add(doc.name);
    return [...names];
  }, [allDocs, selectedDocs]);

  const highlightedInput = useMemo(
    () => splitMentionSegments(input, mentionNames),
    [input, mentionNames],
  );

  const syncMentionAnchor = useCallback(() => {
    const el = textareaRef.current;
    if (!el || atQuery === null) {
      setMentionAnchor(null);
      return;
    }
    const caret = getTextareaCaretCoordinates(el, el.selectionStart);
    const pickerWidth = 260;
    const left = Math.max(8, Math.min(caret.left, Math.max(8, el.clientWidth - pickerWidth - 8)));
    const top = caret.top - el.scrollTop + caret.height + 4;
    setMentionAnchor({ top, left });
  }, [atQuery]);

  useEffect(() => {
    syncMentionAnchor();
  }, [atQuery, input, mentionOptions.length, syncMentionAnchor]);

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
      const explicit = documentIds ?? selectedDocs.map((d) => d.id);
      // Merge chip selections with names typed in the message (incl. files in folders).
      const mergedIds = [
        ...new Set([...explicit, ...named.filter((d) => d.status === 'ready').map((d) => d.id)]),
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
            ? `"${first.name}" ${humanizeIngestionFailure(first.failureReason)}. Open Library → file menu → Retry.`
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
      setToolStatus(null);
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
          onToolCall: (name, _input, statusLabel) => {
            setToolStatus(statusLabel?.trim() || `Running ${name}…`);
          },
          onToolResult: () => setToolStatus(null),
          onDelta: (delta) => {
            setToolStatus(null);
            setStreaming((prev) => prev + delta);
          },
          onCitations: (citations) => setLiveCitations(citations),
          onWriteConfirm: (event) => setWriteConfirm(event),
          onDone: (message) => {
            appendMessageToCache(queryClient, id, message);
            setStreaming('');
            setLiveCitations([]);
            setToolStatus(null);
          },
        });
        setStreaming('');
        setPendingUser(null);
        setLiveCitations([]);
        setToolStatus(null);
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
        setToolStatus(null);
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
      setMentionAnchor(null);
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
    setMentionAnchor(null);
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

  function openCitation(
    citation: MessageCitation,
    index1Based?: number,
    messageContent?: string | null,
  ) {
    const sourceType = citation.sourceType ?? 'document';
    if (sourceType === 'meeting' && citation.meetingId) {
      const ms = citation.startMs != null ? `&t=${citation.startMs}` : '';
      navigate(`/app/meetings?id=${encodeURIComponent(citation.meetingId)}${ms}`);
      return;
    }
    if (sourceType === 'workflow' && citation.workflowId) {
      navigate(`/app/workflows?id=${encodeURIComponent(citation.workflowId)}`);
      return;
    }
    if (sourceType === 'work_item' && citation.href) {
      window.open(citation.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (sourceType === 'channel') {
      notify.info(
        'Channel memory is cited from Slack — open Connectors to manage bindings.',
        'Channel',
      );
      return;
    }
    if (!citation.documentId) return;
    const hasRange =
      citation.startOffset != null &&
      citation.endOffset != null &&
      citation.endOffset > citation.startOffset;
    const hint =
      index1Based != null && messageContent
        ? citationContextHint(messageContent, index1Based)
        : null;
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
      hint,
    });
  }

  function renderCitations(citations: MessageCitation[], messageContent?: string | null) {
    const chips = uniqueSourceChips(citations);
    if (!chips.length) return null;
    return (
      <div className="mt-0 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            type="button"
            key={`${chip.sourceType}:${chip.documentId || chip.label}:${chip.indices[0]}`}
            className="text-[11px] px-2 py-0.5 rounded-full border border-primary-base/20 bg-primary-alpha-10 text-primary-base hover:bg-primary-base hover:text-white transition-colors"
            onClick={() => openCitation(chip.best, chip.indices[0], messageContent)}
            title={
              chip.best.score != null
                ? `${chip.label} · ${chip.sourceType} · refs ${chip.indices.map((n) => `[${n}]`).join(' ')} · relevance ${(chip.best.score * 100).toFixed(0)}%`
                : `${chip.label} · ${chip.sourceType} · refs ${chip.indices.map((n) => `[${n}]`).join(' ')}`
            }
          >
            <span>{chip.label}</span>
            {chip.sourceType !== 'document' ? (
              <span className="ml-1 opacity-70 capitalize">
                {chip.sourceType.replace('_', ' ')}
              </span>
            ) : chip.indices.length > 1 ? (
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
          onCitationClick={(citation, index) => openCitation(citation, index, content)}
        />
        {partial ? <p className="mt-1 text-[11px] text-neutral-400">Stopped early</p> : null}
        {renderCitations(citations, content)}
      </div>
    );
  }

  function renderAssistantAvatar() {
    return (
      <img
        src={voiceBubble}
        alt=""
        aria-hidden
        className="h-[30px] w-[30px] shrink-0 object-contain"
      />
    );
  }

  function applyCapabilityPrompt(prompt: string) {
    const el = textareaRef.current;
    const next = `${prompt} @`;
    onInputChange(next, next.length);
    requestAnimationFrame(() => {
      if (el) {
        el.style.height = '44px';
        el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 160)}px`;
        el.focus();
        el.setSelectionRange(next.length, next.length);
      }
      syncMentionAnchor();
    });
  }

  function renderCapabilityPrompts() {
    return (
      <div className="grid w-full max-w-[720px] grid-cols-3 gap-2.5">
        {CAPABILITY_PROMPTS.map(({ prompt, Icon }) => (
          <button
            type="button"
            key={prompt}
            className={`flex min-h-[108px] cursor-pointer flex-col items-start justify-between gap-3 border border-neutral-200 bg-white p-3.5 text-left transition-colors hover:border-primary-base/35 hover:bg-surface-chip ${COMPOSER_CHIP_RADIUS}`}
            onClick={() => applyCapabilityPrompt(prompt)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-8 bg-primary-alpha-10 text-primary-base">
              <Icon size={16} />
            </span>
            <span className="text-[13px] font-medium leading-snug text-neutral-700">{prompt}</span>
          </button>
        ))}
      </div>
    );
  }

  function renderComposer() {
    const openMentionPicker = () => {
      const el = textareaRef.current;
      const next = `${input}${input.endsWith(' ') || !input ? '' : ' '}@`;
      onInputChange(next, next.length);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(next.length, next.length);
        syncMentionAnchor();
      });
    };

    const mentionPicker =
      mentionOptions.length > 0 && mentionAnchor ? (
        <div
          className="absolute z-30 max-h-[220px] w-[260px] overflow-y-auto rounded-[10px] border border-neutral-200 bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          style={{ top: mentionAnchor.top, left: mentionAnchor.left }}
          role="listbox"
        >
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
                className={`flex w-full items-center gap-2 rounded-8 border-none bg-transparent p-[6px_8px] text-left font-sans transition-colors duration-200 ${i === atIndex ? 'bg-neutral-50' : 'hover:bg-neutral-50'} ${ready ? '' : 'opacity-70'}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(doc);
                }}
              >
                <span className="text-[14px] leading-none" aria-hidden>
                  {fileTypeEmoji(kind)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-neutral-950">{doc.name}</span>
                  <span className="truncate text-[11px] text-neutral-400">
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
      ) : null;

    return (
      <div className="relative flex w-full max-w-[720px] flex-col gap-2 text-left">
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

        <div className="flex items-center gap-2 px-1">
          <IconZap size={14} className="text-neutral-400" />
          <span className="text-[13px] font-medium text-neutral-600">
            You are remaining with{' '}
            <span className="font-semibold text-primary-base">
              {credits.data?.balance?.toLocaleString() ?? '—'}
            </span>{' '}
            credits
          </span>
        </div>

        <div className="flex w-full flex-col gap-2 rounded-[20px] bg-neutral-100 p-2 transition-shadow duration-200 focus-within:shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
          {selectedDocs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
              {selectedDocs.map((doc) => {
                const kind = mimeKind(doc.mimeType, doc.name);
                return (
                  <span
                    key={doc.id}
                    className={`inline-flex max-w-[200px] items-center gap-1.5 overflow-hidden whitespace-nowrap border border-neutral-200 bg-white py-[5px] pl-2 pr-1.5 text-[13px] font-medium text-neutral-700 ${COMPOSER_CHIP_RADIUS}`}
                  >
                    <span className="text-[14px] leading-none" aria-hidden>
                      {fileTypeEmoji(kind)}
                    </span>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      {doc.name}
                    </span>
                    <button
                      type="button"
                      className="ml-0.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent p-0 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                      aria-label={`Remove ${doc.name}`}
                      onClick={() => setSelectedDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                    >
                      <IconClose size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}

          <div
            className={`relative z-20 flex flex-col overflow-visible border border-neutral-200/80 bg-white ${COMPOSER_CHIP_RADIUS}`}
          >
            <div className="relative">
              <div
                ref={highlightRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-3 py-2.5 text-left font-sans text-[15px] font-normal leading-[22px] text-neutral-950"
              >
                {highlightedInput.map((segment, index) =>
                  segment.mention ? (
                    <span
                      key={`m-${index}`}
                      className="text-primary-base underline decoration-primary-base/55 underline-offset-[3px]"
                    >
                      {segment.text}
                    </span>
                  ) : (
                    <span key={`t-${index}`}>{segment.text}</span>
                  ),
                )}
                {input.endsWith('\n') ? '\n' : null}
              </div>
              <textarea
                ref={textareaRef}
                className="composer-input relative z-10 h-[44px] max-h-[160px] w-full resize-none overflow-y-auto border-none bg-transparent px-3 py-2.5 text-left font-sans text-[15px] font-normal leading-[22px] text-transparent caret-neutral-950 outline-none [overflow-wrap:anywhere] placeholder:text-neutral-400 disabled:opacity-60"
                placeholder={
                  selectedDocs.length
                    ? 'Ask about the attached documents…'
                    : 'Ask about your documents… use @ to mention'
                }
                value={input}
                aria-label="Chat message"
                disabled={loading}
                rows={1}
                onScroll={(e) => {
                  if (highlightRef.current) {
                    highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                  syncMentionAnchor();
                }}
                onSelect={syncMentionAnchor}
                onClick={syncMentionAnchor}
                onKeyUp={syncMentionAnchor}
                onChange={(e) => {
                  onInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length);
                  const el = textareaRef.current;
                  if (el) {
                    el.style.height = '44px';
                    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 160)}px`;
                  }
                  requestAnimationFrame(syncMentionAnchor);
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
                      setMentionAnchor(null);
                      return;
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
              />
              {mentionPicker}
            </div>

            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
              <button
                type="button"
                className={`flex h-8 w-8 cursor-pointer items-center justify-center border border-neutral-200 bg-white text-neutral-500 transition-colors duration-200 hover:bg-neutral-50 hover:text-neutral-700 ${COMPOSER_CHIP_RADIUS}`}
                aria-label="Mention a document"
                title="Type @ to mention a document"
                onClick={openMentionPicker}
              >
                <IconAttach size={16} />
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center border border-neutral-200 bg-white text-neutral-500 transition-colors duration-200 hover:bg-neutral-50 hover:text-neutral-700 ${COMPOSER_CHIP_RADIUS}`}
                  aria-label="Voice input"
                  title="Voice coming soon"
                  onClick={() => notify.info('Voice input is coming soon.', 'Coming soon')}
                >
                  <IconMic size={16} />
                </button>
                {loading ? (
                  <Button size="xs" variant="neutral" mode="stroke" onClick={stopStreaming}>
                    Stop
                  </Button>
                ) : (
                  <button
                    type="button"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center border-none transition-all duration-200 ${COMPOSER_CHIP_RADIUS} ${
                      input.trim()
                        ? 'cursor-pointer bg-primary-base text-white hover:scale-105 hover:bg-primary-darker'
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
            <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col items-center justify-center gap-8 px-6 py-12">
              {!input && selectedDocs.length === 0 && atQuery === null ? (
                <img
                  src={voiceBubble}
                  alt=""
                  className="h-32 w-32 shrink-0 object-contain md:h-36 md:w-36"
                />
              ) : null}
              <h1 className="m-0 text-center text-[28px] font-medium leading-[1.2] tracking-tight text-neutral-950 md:text-[32px]">
                {timeGreetingPrefix()},{' '}
                <span className="font-serif italic text-primary-base">{firstName}</span>
              </h1>
              <div className="w-full text-left">{renderComposer()}</div>
              {!readyDocs.length && allDocs.some((d) => d.status === 'failed') ? (
                <p className="text-para-xs m-0 max-w-[420px] text-center text-neutral-500">
                  Some uploads failed processing (often embedding rate limits). Open Library, open
                  the file menu, and choose Retry once they are ready for chat.
                </p>
              ) : null}
              <p className="text-[11px] m-0 max-w-[700px] text-center leading-[1.6] text-neutral-400">
                Script AI only provides insights based on your uploaded documents.
              </p>
              {renderCapabilityPrompts()}
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
                    {renderAssistantContent(
                      message.content,
                      message.citations ?? [],
                      message.partial,
                    )}
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
                        {toolStatus ?? THINKING_PHRASES[thinkingIndex]}
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
                      hint: preview.hint,
                    }
                  : null
              }
              onClose={() => setPreview(null)}
              className="h-full w-full min-h-0 border-l border-neutral-200"
            />
          </div>
        </>
      ) : null}

      <ConfirmModal
        open={Boolean(writeConfirm)}
        onOpenChange={(open) => {
          if (open) return;
          const pending = writeConfirm;
          setWriteConfirm(null);
          if (!pending || writeConfirmLoading) return;
          void rejectWriteConfirmation(pending.confirmToken).catch(() => undefined);
        }}
        title="Mark workflow step complete?"
        description={
          writeConfirm
            ? writeConfirm.summary?.trim() ||
              `Confirm the agent may mark step “${writeConfirm.stepKey}” done on this workflow run.`
            : undefined
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        loading={writeConfirmLoading}
        onConfirm={async () => {
          if (!writeConfirm) return;
          setWriteConfirmLoading(true);
          try {
            await confirmWriteConfirmation(writeConfirm.confirmToken);
            notify.success('Workflow step marked complete.', 'Confirmed');
            setWriteConfirm(null);
          } catch (err) {
            notify.error(getErrorMessage(err, 'Could not confirm workflow step'));
          } finally {
            setWriteConfirmLoading(false);
          }
        }}
      />
    </div>
  );
}
