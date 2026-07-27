import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  humanizeIngestionFailure,
  type IntegrationProvider,
  type PublicDocument,
  type PublicFolder,
} from '@script/shared';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';
import { CloudImportModal } from '../../components/app/CloudImportModal';
import { UploadProgressCard } from '../../components/app/UploadProgressCard';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { FormModal } from '../../components/ui/FormModal';
import { LoadingState } from '../../components/ui/LoadingState';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalIllustration,
} from '../../components/ui/Modal';
import {
  ModalIllustrationAdd,
  ModalIllustrationDelete,
  ModalIllustrationLink,
  ModalIllustrationMove,
  ModalIllustrationRename,
} from '../../components/ui/ModalIllustrations';
import {
  SideDrawer,
  SideDrawerBody,
  SideDrawerContent,
  SideDrawerHeader,
} from '../../components/ui/SideDrawer';
import { notify } from '../../components/ui/toast-alert';
import { useCredits } from '../../lib/chat-api';
import { getErrorMessage } from '../../lib/form-errors';
import {
  PROVIDER_LABELS,
  useIntegrationMutations,
  useIntegrations,
} from '../../lib/integrations-api';
import {
  IconArchive,
  IconArrowUp,
  IconAttach,
  IconClose,
  IconDocFile,
  IconFile,
  IconFolderSimple,
  IconGrid,
  IconImage,
  IconMenu,
  IconMore,
  IconPlus,
  IconSearch,
  IconSettings,
  IconUpload,
  IconZap,
} from '../../lib/icons';
import {
  useDocument,
  useDocumentVersions,
  useDocuments,
  useFolders,
  useLibraryMutations,
} from '../../lib/library-api';

type QueueItemStatus = 'uploading' | 'processing' | 'ready' | 'failed';
type QueueItem = {
  id: string;
  name: string;
  kind: 'upload' | 'process' | 'import';
  status: QueueItemStatus;
  percent?: number | null;
  error?: string;
  documentId?: string;
};

const ALL_PROVIDERS: IntegrationProvider[] = ['drive', 'dropbox', 'onedrive', 'box'];

type ViewMode = 'grid' | 'list';
type FileKind = 'pdf' | 'doc' | 'xls' | 'txt' | 'img' | 'other';

type PathCrumb = { id: string; name: string };

type ContextTarget =
  | { kind: 'folder'; item: PublicFolder }
  | { kind: 'file'; item: PublicDocument };

const TYPE_COLOR: Record<FileKind, string> = {
  pdf: '#6060FF',
  doc: '#6060FF',
  xls: '#6060FF',
  txt: '#6060FF',
  img: '#6060FF',
  other: '#6060FF',
};

const TYPE_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  doc: 'DOCX',
  xls: 'XLSX',
  txt: 'TXT',
  img: 'IMG',
  other: 'UNK',
};

function fileKind(doc: PublicDocument): FileKind {
  const mime = (doc.mimeType || '').toLowerCase();
  const name = doc.name.toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (
    mime.includes('word') ||
    mime.includes('msword') ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  )
    return 'doc';
  if (
    mime.includes('sheet') ||
    mime.includes('excel') ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.csv')
  )
    return 'xls';
  if (mime.startsWith('image/')) return 'img';
  if (mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return 'txt';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function isDocProcessing(doc: PublicDocument): boolean {
  return doc.status === 'pending' || doc.status === 'processing' || doc.isUpdating;
}

/** Soft label for cards — prefer short humanized copy, never raw provider dumps. */
function cardStatusLabel(doc: PublicDocument): string | null {
  if (doc.isUpdating || doc.status === 'pending' || doc.status === 'processing') {
    return 'Processing…';
  }
  if (doc.status === 'failed') {
    return doc.failureReason
      ? humanizeIngestionFailure(doc.failureReason)
      : 'Processing failed';
  }
  return null;
}

function queueStatusLabel(item: QueueItem): string {
  if (item.status === 'uploading') {
    return typeof item.percent === 'number' ? `Uploading ${item.percent}%` : 'Uploading…';
  }
  if (item.status === 'processing') {
    return typeof item.percent === 'number' ? `Processing ${item.percent}%` : 'Processing…';
  }
  if (item.status === 'failed') {
    return item.error
      ? humanizeIngestionFailure(item.error)
      : 'Processing failed';
  }
  return 'Ready';
}

function FolderCard({
  name,
  itemCount,
  onOpen,
  onMove,
  onMenu,
}: {
  name: string;
  itemCount: number;
  onOpen: () => void;
  onMove: (e: React.MouseEvent) => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const itemsLabel = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  const hasFiles = itemCount > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative w-full cursor-pointer border-none bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-base focus-visible:ring-offset-2 rounded-[18px]"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={onMenu}
    >
      {/* Papers peeking out when the folder has files */}
      {hasFiles ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[36px]" aria-hidden>
          <div className="absolute left-[22%] top-[4px] h-[30px] w-[38%] -rotate-[10deg] rounded-[3px] border border-neutral-200/80 bg-white shadow-[0_2px_5px_rgba(15,15,40,0.12)]" />
          <div className="absolute left-[34%] top-0 h-[32px] w-[40%] rotate-[3deg] rounded-[3px] border border-neutral-200/90 bg-white shadow-[0_2px_6px_rgba(15,15,40,0.14)]" />
          <div className="absolute left-[48%] top-[5px] h-[28px] w-[34%] rotate-[14deg] rounded-[3px] border border-neutral-100 bg-white shadow-[0_1px_4px_rgba(15,15,40,0.1)]" />
        </div>
      ) : null}

      {/* Tab */}
      <div
        className={`absolute left-3 z-[1] h-[11px] w-[44px] rounded-t-[9px] bg-gradient-to-b from-[#9A9AFF] to-primary-base ${hasFiles ? 'top-[14px]' : 'top-0'}`}
        aria-hidden
      />

      {/* Body */}
      <div
        className={`relative z-[2] flex min-h-[89px] flex-col justify-between overflow-hidden rounded-[18px] bg-gradient-to-b from-[#8B8BFF] via-primary-base to-primary-dark p-3 shadow-[0_8px_18px_rgba(96,96,255,0.28),0_1px_4px_rgba(58,58,212,0.18)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_22px_rgba(96,96,255,0.34)] ${hasFiles ? 'mt-[22px]' : 'mt-[8px]'}`}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/20 to-transparent"
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate font-mono text-[12px] font-medium leading-4 tracking-[-0.01em] text-white">
              {name}
            </p>
            <p className="m-0 mt-0.5 font-mono text-[10px] leading-3 text-white/75">{itemsLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-6 border-none bg-transparent text-white/85 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
              aria-label={`Move ${name}`}
              title="Move"
              onClick={onMove}
            >
              <IconArchive size={12} />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-6 border-none bg-transparent text-white/85 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
              aria-label={`Folder actions for ${name}`}
              title="Folder actions"
              onClick={onMenu}
            >
              <IconSettings size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SmallFolderIcon({ hasFiles = false }: { hasFiles?: boolean }) {
  return (
    <div className="relative h-8 w-9 shrink-0" aria-hidden>
      {hasFiles ? (
        <>
          <div className="absolute left-[10px] top-0 h-3.5 w-3 -rotate-6 rounded-[2px] border border-neutral-200 bg-white" />
          <div className="absolute left-[14px] top-0 h-3.5 w-3 rotate-6 rounded-[2px] border border-neutral-200 bg-white" />
        </>
      ) : null}
      <div className="absolute left-1 top-0.5 z-[1] h-2 w-3.5 rounded-t-[4px] bg-primary-base/80" />
      <div className="absolute bottom-0 left-0 right-0 top-2 z-[2] rounded-[6px] bg-gradient-to-b from-[#8B8BFF] via-primary-base to-primary-dark shadow-sm" />
    </div>
  );
}

function FileTypeMark({ kind }: { kind: FileKind }) {
  if (kind === 'pdf') {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 44 44"
        fill="none"
        aria-hidden
        className="text-primary-base"
      >
        <path
          d="M22 8c-6.2 0-10.5 3.4-10.5 8.2 0 3.4 2.2 5.6 6.4 7.1l3.2 1.1c3.1 1.1 4.4 2.1 4.4 3.8 0 2.1-1.9 3.5-4.8 3.5-2.7 0-5-.9-6.8-2.3"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M22 36c6.2 0 10.5-3.4 10.5-8.2 0-3.4-2.2-5.6-6.4-7.1l-3.2-1.1c-3.1-1.1-4.4-2.1-4.4-3.8 0-2.1 1.9-3.5 4.8-3.5 2.7 0 5 .9 6.8 2.3"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'doc') {
    return (
      <span className="font-mono text-[28px] font-semibold leading-none tracking-tight text-primary-base">
        W
      </span>
    );
  }
  if (kind === 'xls') {
    return (
      <span className="font-mono text-[28px] font-semibold leading-none tracking-tight text-primary-base">
        X
      </span>
    );
  }
  if (kind === 'img') {
    return <IconImage size={26} className="text-primary-base" />;
  }
  if (kind === 'txt') {
    return (
      <span className="font-mono text-[24px] font-semibold leading-none tracking-tight text-primary-base">
        T
      </span>
    );
  }
  return (
    <span className="font-mono text-[28px] font-semibold leading-none tracking-tight text-primary-base">
      ?
    </span>
  );
}

/** Peeled corner: primary fills the top-right; only the inward (bottom-left)
 *  corner is heavily rounded so it reads as paper folded back. */
function PeeledCorner({ size = 16 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 top-0 z-[6] bg-primary-base"
      style={{
        width: size,
        height: size,
        borderBottomLeftRadius: Math.round(size * 0.92),
      }}
    />
  );
}

function FileCard({
  doc,
  onOpen,
  onMenu,
  onDragStart,
}: {
  doc: PublicDocument;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const kind = fileKind(doc);
  const status = cardStatusLabel(doc);
  const peel = 16;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={doc.status === 'ready'}
      onDragStart={onDragStart}
      className="group relative flex min-h-[108px] cursor-pointer flex-col overflow-hidden rounded-[12px] border border-neutral-200/90 bg-[#F7F7FB] p-2.5 text-left shadow-[0_4px_12px_rgba(15,15,40,0.06)] outline-none transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(15,15,40,0.1)] focus-visible:ring-2 focus-visible:ring-primary-base focus-visible:ring-offset-2"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={onMenu}
    >
      <PeeledCorner size={peel} />

      <div className="relative z-[3] flex items-start justify-between gap-1.5 pr-2.5">
        <span className="inline-flex rounded-[4px] bg-primary-base px-1 py-px font-mono text-[8px] font-semibold uppercase tracking-[0.06em] text-white">
          {TYPE_LABEL[kind]}
        </span>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-4 border-none bg-transparent text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700 cursor-pointer"
          aria-label={`Actions for ${doc.name}`}
          onClick={onMenu}
        >
          <IconMore size={12} />
        </button>
      </div>

      <div className="relative z-[3] flex flex-1 items-center justify-center py-2">
        <FileTypeMark kind={kind} />
      </div>

      <div className="relative z-[3] min-w-0">
        <p className="m-0 truncate font-mono text-[11px] font-medium leading-[14px] text-neutral-800">
          {doc.name}
        </p>
        <p className="m-0 mt-0.5 font-mono text-[9px] leading-3 text-neutral-500">
          {status ?? formatBytes(doc.byteSize)}
        </p>
        {!status ? (
          <p className="m-0 mt-px font-mono text-[9px] leading-3 text-neutral-400">
            {formatDate(doc.createdAt)}
          </p>
        ) : (
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-primary-alpha-10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-base" />
          </div>
        )}
      </div>
    </div>
  );
}

function SmallFileIcon({ kind }: { kind: FileKind }) {
  const peel = 10;
  return (
    <div className="relative flex h-8 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-neutral-200 bg-[#F7F7FB]">
      <PeeledCorner size={peel} />
      <span className="relative z-[1] font-mono text-[7px] font-bold tracking-[0.04em] text-primary-base">
        {TYPE_LABEL[kind].slice(0, 3)}
      </span>
    </div>
  );
}

function MoreButton({ onOpen }: { onOpen: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      className="inline-flex p-1 rounded-6 bg-white shadow-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50 border-solid cursor-pointer"
      aria-label="More actions"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e);
      }}
    >
      <IconMore size={14} />
    </button>
  );
}

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [path, setPath] = useState<PathCrumb[]>([]);
  const currentFolderId = path.length ? path[path.length - 1]!.id : null;

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [dragActive, setDragActive] = useState(false);
  const [cloudImportOpen, setCloudImportOpen] = useState(false);
  const [cloudProvider, setCloudProvider] = useState<IntegrationProvider | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextTarget;
  } | null>(null);

  const [renameState, setRenameState] = useState<ContextTarget | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [moveState, setMoveState] = useState<ContextTarget | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<ContextTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [versionsDoc, setVersionsDoc] = useState<PublicDocument | null>(null);
  const [rollbackBusyId, setRollbackBusyId] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState('');
  const [quotedDocs, setQuotedDocs] = useState<PublicDocument[]>([]);
  const [chatDropActive, setChatDropActive] = useState(false);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [activeProgress, setActiveProgress] = useState<{
    title: string;
    detail?: string;
    percent?: number | null;
  } | null>(null);

  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    const status = searchParams.get('integration');
    if (!status) return;
    const provider = searchParams.get('provider');
    const message = searchParams.get('message');
    if (status === 'connected') {
      notify.success(provider ? `Connected ${provider}` : 'Cloud provider connected');
    } else if (status === 'error') {
      notify.error(message || 'Cloud connection failed');
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const foldersQuery = useFolders(currentFolderId);
  const documentsQuery = useDocuments(currentFolderId);
  // Root folders for move picker (always top-level)
  const rootFoldersQuery = useFolders(null);
  const previewQuery = useDocument(previewId);
  const versionsQuery = useDocumentVersions(versionsDoc?.id ?? null);
  const mutations = useLibraryMutations();
  const credits = useCredits();
  const integrationsQuery = useIntegrations(addModalOpen || cloudImportOpen);
  const integrationMutations = useIntegrationMutations();

  const moveFolders = rootFoldersQuery.data ?? [];

  const connectedProviders = useMemo(() => {
    const set = new Set(
      (integrationsQuery.data?.providers ?? [])
        .filter((p) => p.connected)
        .map((p) => p.provider),
    );
    return set;
  }, [integrationsQuery.data]);

  function upsertQueueItem(item: QueueItem) {
    setQueueItems((prev) => {
      const idx = prev.findIndex((q) => q.id === item.id);
      if (idx < 0) return [item, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...item };
      return next;
    });
  }

  function patchQueueItem(id: string, patch: Partial<QueueItem>) {
    setQueueItems((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  const q = search.toLowerCase().trim();
  const displayFolders = useMemo(() => {
    const folders = foldersQuery.data ?? [];
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [foldersQuery.data, q]);

  const displayFiles = useMemo(() => {
    const documents = documentsQuery.data ?? [];
    if (!q) return documents;
    return documents.filter((d) => d.name.toLowerCase().includes(q));
  }, [documentsQuery.data, q]);
  const previewListDocument = previewId
    ? (documentsQuery.data ?? []).find((doc) => doc.id === previewId)
    : undefined;
  const previewLoading =
    Boolean(previewId) && !previewQuery.data && (previewQuery.isLoading || previewQuery.isFetching);

  // Mirror in-flight / failed library docs into the upload queue (statuses live there, not on cards).
  useEffect(() => {
    const docs = documentsQuery.data ?? [];
    setQueueItems((prev) => {
      const byDoc = new Map(
        prev.filter((i) => i.documentId).map((i) => [i.documentId!, i] as const),
      );
      let changed = false;
      const next = [...prev];

      for (const doc of docs) {
        const existing = byDoc.get(doc.id);
        if (doc.status === 'failed' || isDocProcessing(doc)) {
          const status: QueueItemStatus = doc.status === 'failed' ? 'failed' : 'processing';
          const error = doc.failureReason
            ? humanizeIngestionFailure(doc.failureReason)
            : undefined;
          if (!existing) {
            next.unshift({
              id: `doc-${doc.id}`,
              name: doc.name,
              kind: 'process',
              status,
              documentId: doc.id,
              error,
              percent: null,
            });
            changed = true;
          } else if (
            existing.status !== status ||
            existing.error !== error ||
            existing.name !== doc.name
          ) {
            const idx = next.findIndex((i) => i.id === existing.id);
            if (idx >= 0) {
              next[idx] = { ...existing, status, error, name: doc.name, percent: null };
              changed = true;
            }
          }
        } else if (doc.status === 'ready' && existing && existing.status !== 'ready') {
          const idx = next.findIndex((i) => i.id === existing.id);
          if (idx >= 0) {
            next[idx] = { ...existing, status: 'ready', error: undefined, percent: 100 };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [documentsQuery.data]);

  const queueBadgeCount = queueItems.filter(
    (i) => i.status === 'uploading' || i.status === 'processing' || i.status === 'failed',
  ).length;

  async function onUpload(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (!files.length) return;
    if (activeProgress) return;
    const total = files.length;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const queueId = `upload-${Date.now()}-${i}-${file.name}`;
        upsertQueueItem({
          id: queueId,
          name: file.name,
          kind: 'upload',
          status: 'uploading',
          percent: 0,
        });
        setActiveProgress({
          title: `Uploading ${file.name}`,
          detail: total > 1 ? `File ${i + 1} of ${total}` : undefined,
          percent: 0,
        });
        const result = await mutations.uploadFile.mutateAsync({
          file,
          folderId: currentFolderId,
          onProgress: (percent) => {
            patchQueueItem(queueId, { percent });
            setActiveProgress((prev) =>
              prev ? { ...prev, percent } : prev,
            );
          },
        });
        patchQueueItem(queueId, {
          status: 'processing',
          percent: null,
          documentId: result.document.id,
          name: result.document.name,
        });
      }
      notify.success(total === 1 ? 'File uploaded' : `${total} files uploaded`);
    } catch (err) {
      const message = getErrorMessage(err, 'Upload failed');
      setQueueItems((prev) =>
        prev.map((item) =>
          item.status === 'uploading'
            ? { ...item, status: 'failed', error: message, percent: null }
            : item,
        ),
      );
      setQueueOpen(true);
      notify.error(message);
    } finally {
      setActiveProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  }

  function onDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      await onUpload(e.dataTransfer.files);
    }
  }

  function openFolder(folder: PublicFolder) {
    setPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearch('');
    setContextMenu(null);
  }

  function goToCrumb(index: number) {
    if (index < 0) {
      setPath([]);
    } else {
      setPath((prev) => prev.slice(0, index + 1));
    }
    setSearch('');
  }

  function openContext(e: React.MouseEvent, target: ContextTarget) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect?.();
    const x = e.clientX || (rect ? rect.right : 0);
    const y = e.clientY || (rect ? rect.bottom : 0);
    setContextMenu({ x, y, target });
  }

  function handleChatSubmit() {
    const trimmed = chatInput.trim();
    if (!trimmed && quotedDocs.length === 0) return;
    const mentions = quotedDocs.map((d) => `@${d.name}`).join(' ');
    const fullMessage = mentions ? `${mentions} ${trimmed}`.trim() : trimmed;
    navigate('/app/chat', {
      state: {
        initialMessage: fullMessage,
        documentIds: quotedDocs.map((d) => d.id),
      },
    });
  }

  function onFileDragStart(e: React.DragEvent, doc: PublicDocument) {
    if (doc.status !== 'ready') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/x-script-document-id', doc.id);
    e.dataTransfer.setData('application/x-script-document-name', doc.name);
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ id: doc.id, name: doc.name, status: doc.status }),
    );
    e.dataTransfer.effectAllowed = 'copy';
  }

  function onChatDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setChatDropActive(false);
    const id = e.dataTransfer.getData('application/x-script-document-id');
    const name = e.dataTransfer.getData('application/x-script-document-name');
    if (!id) return;
    const fromList = (documentsQuery.data ?? []).find((d) => d.id === id);
    const doc: PublicDocument =
      fromList ??
      ({
        id,
        name: name || id,
        folderId: null,
        mimeType: 'application/octet-stream',
        byteSize: 0,
        source: 'local',
        sourceUrl: null,
        status: 'ready',
        processingPhase: null,
        failureReason: null,
        pageCount: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedAt: null,
        currentVersionId: null,
        currentVersionNumber: null,
        isUpdating: false,
      } as PublicDocument);
    setQuotedDocs((prev) => (prev.some((p) => p.id === doc.id) ? prev : [...prev, doc]));
    chatTextareaRef.current?.focus();
  }

  async function submitRename(name: string) {
    if (!renameState) return;
    setRenameBusy(true);
    try {
      if (renameState.kind === 'folder') {
        await mutations.updateFolder.mutateAsync({
          folderId: renameState.item.id,
          name,
        });
        setPath((prev) =>
          prev.map((c) => (c.id === renameState.item.id ? { ...c, name } : c)),
        );
        notify.success('Folder renamed');
      } else {
        await mutations.updateDocument.mutateAsync({
          documentId: renameState.item.id,
          name,
        });
        notify.success('File renamed');
      }
      setRenameState(null);
    } catch (err) {
      notify.error(getErrorMessage(err, 'Rename failed'));
    } finally {
      setRenameBusy(false);
    }
  }

  async function submitMove() {
    if (!moveState) return;
    setMoveBusy(true);
    try {
      if (moveState.kind === 'folder') {
        if (moveTargetId === moveState.item.id) {
          throw new Error('Folder cannot be moved into itself');
        }
        await mutations.updateFolder.mutateAsync({
          folderId: moveState.item.id,
          parentId: moveTargetId,
        });
        if (path.some((c) => c.id === moveState.item.id)) {
          setPath((prev) => {
            const idx = prev.findIndex((c) => c.id === moveState.item.id);
            return idx >= 0 ? prev.slice(0, idx) : prev;
          });
        }
        notify.success('Folder moved');
      } else {
        await mutations.updateDocument.mutateAsync({
          documentId: moveState.item.id,
          folderId: moveTargetId,
        });
        notify.success('File moved');
      }
      setMoveState(null);
    } catch (err) {
      notify.error(getErrorMessage(err, 'Move failed'));
    } finally {
      setMoveBusy(false);
    }
  }

  async function submitDelete() {
    if (!deleteState) return;
    setDeleteBusy(true);
    try {
      if (deleteState.kind === 'folder') {
        await mutations.deleteFolder.mutateAsync(deleteState.item.id);
        if (path.some((c) => c.id === deleteState.item.id)) {
          setPath((prev) => {
            const idx = prev.findIndex((c) => c.id === deleteState.item.id);
            return idx >= 0 ? prev.slice(0, idx) : prev;
          });
        }
        notify.success('Folder deleted');
      } else {
        await mutations.deleteDocument.mutateAsync(deleteState.item.id);
        if (previewId === deleteState.item.id) setPreviewId(null);
        notify.success('File deleted');
      }
      setDeleteState(null);
    } catch (err) {
      notify.error(getErrorMessage(err, 'Delete failed'));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function retryDocument(doc: PublicDocument) {
    setContextMenu(null);
    const queueId = `doc-${doc.id}`;
    upsertQueueItem({
      id: queueId,
      name: doc.name,
      kind: 'process',
      status: 'processing',
      documentId: doc.id,
      percent: null,
    });
    setActiveProgress({
      title: `Retrying ${doc.name}`,
      detail: 'Re-queueing processing…',
      percent: null,
    });
    setQueueOpen(true);
    try {
      await mutations.reprocessDocument.mutateAsync(doc.id);
      notify.success(`Reprocessing ${doc.name}`);
    } catch (err) {
      const message = getErrorMessage(err, 'Could not reprocess file');
      patchQueueItem(queueId, { status: 'failed', error: message });
      notify.error(message);
    } finally {
      setActiveProgress(null);
    }
  }

  async function restoreVersion(versionId: string) {
    if (!versionsDoc) return;
    setRollbackBusyId(versionId);
    try {
      const result = await mutations.rollbackDocumentVersion.mutateAsync({
        documentId: versionsDoc.id,
        versionId,
      });
      notify.success(`Restored as version ${result.version.versionNumber}`);
      await versionsQuery.refetch();
    } catch (err) {
      notify.error(getErrorMessage(err, 'Could not restore version'));
    } finally {
      setRollbackBusyId(null);
    }
  }

  const isLoading = foldersQuery.isLoading || documentsQuery.isLoading;
  const loadError = foldersQuery.isError || documentsQuery.isError;

  return (
    <div className="h-full flex flex-col relative bg-white">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        disabled={Boolean(activeProgress)}
        onChange={(e) => {
          void onUpload(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        disabled={Boolean(activeProgress)}
        onChange={(e) => {
          void onUpload(e.target.files);
          e.target.value = '';
        }}
      />

      {activeProgress ? (
        <UploadProgressCard
          title={activeProgress.title}
          detail={activeProgress.detail}
          percent={activeProgress.percent}
        />
      ) : null}

      <div
        className={`flex-1 overflow-y-auto p-6 flex flex-col gap-8 relative transition-colors duration-200 ${dragActive ? 'bg-primary-alpha-10' : ''}`}
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={(e) => void onDrop(e)}
      >
        <div
          className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.neutral.200)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.neutral.200)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none z-0"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_110%_50%_at_50%_0%,transparent_0%,theme(colors.neutral.0)_72%)] pointer-events-none z-10"
          aria-hidden
        />

        {dragActive && (
          <div className="absolute inset-[10px] border-2 border-dashed border-primary-base rounded-20 z-50 pointer-events-none flex items-center justify-center bg-white/50 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 text-primary-base">
              <IconUpload size={32} />
              <span className="text-label-lg font-bold">Drop files here to upload</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 relative z-20">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <nav className="flex items-center gap-1.5 flex-wrap min-w-0" aria-label="breadcrumb">
              <button
                type="button"
                className={`bg-transparent border-none font-sans p-0 transition-colors duration-200 text-para-sm ${
                  path.length === 0
                    ? 'text-neutral-950 font-medium cursor-default'
                    : 'text-neutral-400 hover:text-neutral-950 cursor-pointer'
                }`}
                onClick={() => goToCrumb(-1)}
                disabled={path.length === 0}
              >
                Library
              </button>
              {path.map((crumb, i) => (
                <React.Fragment key={crumb.id}>
                  <span className="text-neutral-400 select-none">/</span>
                  {i === path.length - 1 ? (
                    <span className="text-neutral-950 font-medium text-para-sm truncate max-w-[200px]">
                      {crumb.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="bg-transparent border-none cursor-pointer font-sans p-0 text-para-sm text-neutral-400 hover:text-neutral-950 transition-colors"
                      onClick={() => goToCrumb(i)}
                    >
                      {crumb.name}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </nav>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-neutral-100 rounded-8 p-0.5">
                <button
                  type="button"
                  className={`p-1.5 rounded-6 border-none cursor-pointer transition-colors flex items-center justify-center ${viewMode === 'list' ? 'bg-white shadow-sm text-neutral-950' : 'bg-transparent text-neutral-400 hover:text-neutral-600'}`}
                  onClick={() => setViewMode('list')}
                  title="List view"
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                >
                  <IconMenu size={16} />
                </button>
                <button
                  type="button"
                  className={`p-1.5 rounded-6 border-none cursor-pointer transition-colors flex items-center justify-center ${viewMode === 'grid' ? 'bg-white shadow-sm text-neutral-950' : 'bg-transparent text-neutral-400 hover:text-neutral-600'}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  aria-label="Grid view"
                  aria-pressed={viewMode === 'grid'}
                >
                  <IconGrid size={16} />
                </button>
              </div>
              <Button
                size="xs"
                variant="neutral"
                mode="stroke"
                onClick={() => setQueueOpen(true)}
              >
                Upload queue
                {queueBadgeCount > 0 ? (
                  <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-primary-base text-white text-[10px] font-semibold px-1">
                    {queueBadgeCount > 99 ? '99+' : queueBadgeCount}
                  </span>
                ) : null}
              </Button>
              <Button
                size="xs"
                leftIcon={<IconPlus size={14} />}
                disabled={Boolean(activeProgress)}
                onClick={() => setAddModalOpen(true)}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="relative flex items-center max-w-[360px]">
            <span className="absolute left-3 text-neutral-400 flex items-center pointer-events-none">
              <IconSearch size={16} />
            </span>
            <input
              className="w-full h-9 pl-9 pr-3 bg-white border border-neutral-200 rounded-10 font-sans text-neutral-950 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:border-neutral-300 focus:shadow-[0_0_0_3px_theme(colors.primary.alpha-10)] text-para-sm"
              type="search"
              placeholder={
                currentFolderId
                  ? `Search in ${path[path.length - 1]?.name ?? 'folder'}…`
                  : 'Search files and folders…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search library"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="relative z-20">
            <LoadingState label="Loading library…" />
          </div>
        ) : loadError ? (
          <div className="relative z-20">
            <ErrorState
              message="Failed to load library"
              onRetry={() => {
                void foldersQuery.refetch();
                void documentsQuery.refetch();
              }}
            />
          </div>
        ) : (
          <>
            {(currentFolderId === null || displayFolders.length > 0 || (q && !currentFolderId)) && (
            <section className="flex flex-col gap-4 relative z-20">
              <h2 className="text-label-lg text-neutral-950 m-0">Folders</h2>
              {displayFolders.length === 0 ? (
                <p className="text-para-sm text-neutral-400 m-0">
                  {q ? 'No folders match your search.' : 'No folders yet. Create one to organize files.'}
                </p>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 max-md:grid-cols-[repeat(auto-fill,minmax(112px,1fr))]">
                  {displayFolders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      name={folder.name}
                      itemCount={folder.documentCount}
                      onOpen={() => openFolder(folder)}
                      onMove={(e) => {
                        e.stopPropagation();
                        setMoveState({ kind: 'folder', item: folder });
                        setMoveTargetId(folder.parentId);
                      }}
                      onMenu={(e) => {
                        e.stopPropagation();
                        openContext(e, { kind: 'folder', item: folder });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col border border-neutral-200 rounded-12 overflow-hidden bg-white">
                  {displayFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className="group flex items-center gap-4 p-[12px_16px] border-b border-neutral-200 last:border-0 hover:bg-neutral-50 cursor-pointer transition-colors relative"
                      onClick={() => openFolder(folder)}
                      onContextMenu={(e) => openContext(e, { kind: 'folder', item: folder })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openFolder(folder);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <SmallFolderIcon hasFiles={folder.documentCount > 0} />
                      <span className="text-label-sm text-neutral-950 flex-1 truncate font-mono">
                        {folder.name}
                      </span>
                      <span className="text-para-xs text-neutral-400 w-24 font-mono">
                        {folder.documentCount} item{folder.documentCount === 1 ? '' : 's'}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <button
                          type="button"
                          className="inline-flex p-1.5 rounded-6 bg-white shadow-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 border-solid cursor-pointer"
                          aria-label={`Move ${folder.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveState({ kind: 'folder', item: folder });
                            setMoveTargetId(folder.parentId);
                          }}
                        >
                          <IconArchive size={14} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex p-1.5 rounded-6 bg-white shadow-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 border-solid cursor-pointer"
                          aria-label={`Folder actions for ${folder.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openContext(e, { kind: 'folder', item: folder });
                          }}
                        >
                          <IconSettings size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            )}

            <section className="flex flex-col gap-4 relative z-20 pb-4">
              <h2 className="text-label-lg text-neutral-950 m-0">
                {currentFolderId ? 'Files' : 'Recent files'}
                {q ? (
                  <span className="text-neutral-400 text-para-xs font-normal">
                    {' '}
                    · {displayFiles.length} result{displayFiles.length !== 1 ? 's' : ''}
                  </span>
                ) : null}
              </h2>
              {displayFiles.length === 0 ? (
                <EmptyState
                  title={q ? 'No files match your search' : 'No documents yet'}
                  description={
                    q
                      ? 'Try a different search term.'
                      : 'Drag and drop files here, upload, or import from a URL or cloud provider.'
                  }
                  action={
                    !q ? (
                      <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                        <IconUpload size={14} /> Upload files
                      </Button>
                    ) : undefined
                  }
                />
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
                  {displayFiles.map((doc) => (
                    <FileCard
                      key={doc.id}
                      doc={doc}
                      onOpen={() => setPreviewId(doc.id)}
                      onMenu={(e) => {
                        e.stopPropagation();
                        openContext(e, { kind: 'file', item: doc });
                      }}
                      onDragStart={(e) => onFileDragStart(e, doc)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col border border-neutral-200 rounded-12 overflow-hidden bg-white">
                  {displayFiles.map((doc) => {
                    const kind = fileKind(doc);
                    const status = cardStatusLabel(doc);
                    return (
                      <div
                        key={doc.id}
                        draggable={doc.status === 'ready'}
                        onDragStart={(e) => onFileDragStart(e, doc)}
                        className="group flex items-center gap-4 p-[12px_16px] border-b border-neutral-200 last:border-0 hover:bg-neutral-50 cursor-pointer transition-colors relative"
                        onClick={() => setPreviewId(doc.id)}
                        onContextMenu={(e) => openContext(e, { kind: 'file', item: doc })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPreviewId(doc.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <SmallFileIcon kind={kind} />
                        <div className="flex-1 min-w-0">
                          <span className="text-label-sm text-neutral-950 truncate block">
                            {doc.name}
                          </span>
                          {isDocProcessing(doc) ? (
                            <div className="h-1 w-full max-w-[160px] bg-neutral-100 rounded-full overflow-hidden mt-1">
                              <div className="h-full w-1/2 bg-primary-base rounded-full animate-pulse" />
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`text-para-xs w-28 hidden md:block truncate ${
                            isDocProcessing(doc) ? 'text-primary-base' : 'text-neutral-400'
                          }`}
                        >
                          {status ?? formatBytes(doc.byteSize)}
                        </span>
                        <span className="text-para-xs text-neutral-400 w-28 hidden md:block">
                          {formatDate(doc.createdAt)}
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreButton onOpen={(e) => openContext(e, { kind: 'file', item: doc })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Pinned chat composer */}
      <div
        className="relative z-10 shrink-0 flex flex-col items-center px-4 pt-3 pb-4 bg-white border-t border-neutral-100"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setChatDropActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setChatDropActive(false);
        }}
        onDrop={onChatDrop}
      >
        <div className="w-full max-w-[720px] mx-auto relative flex flex-col">
          <div
            className={`w-full bg-neutral-50 rounded-[20px] p-[6px_6px_8px] flex flex-col gap-1.5 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.lg)] transition-all duration-200 focus-within:shadow-[0_0_0_1.5px_theme(colors.neutral.300),theme(boxShadow.lg)] ${chatDropActive ? 'ring-2 ring-primary-base' : ''}`}
          >
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
                ref={chatTextareaRef}
                className="flex-1 border-none outline-none resize-none bg-transparent font-sans text-neutral-950 leading-[1.6] min-h-[60px] max-h-[200px] overflow-y-auto p-[8px_16px] placeholder:text-neutral-400 text-para-md"
                placeholder={
                  chatDropActive
                    ? 'Drop a file here to quote it…'
                    : 'Ask about your documents…'
                }
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  if (chatTextareaRef.current) {
                    chatTextareaRef.current.style.height = 'auto';
                    chatTextareaRef.current.style.height = `${Math.min(chatTextareaRef.current.scrollHeight, 120)}px`;
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit();
                  }
                }}
                rows={2}
                aria-label="Start a chat about your library"
              />
              <div className="flex items-center justify-between p-[8px_12px_12px_12px] gap-2">
                <div className="flex items-center gap-1 flex-wrap min-w-0">
                  <button
                    type="button"
                    className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 hover:text-neutral-600 hover:bg-neutral-200"
                    aria-label="Upload file"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <IconAttach size={17} />
                  </button>
                  {quotedDocs.map((doc) => (
                    <span
                      key={doc.id}
                      className="inline-flex items-center gap-[5px] px-[8px] py-[3px] bg-white border border-neutral-200 rounded-full text-[11px] font-medium text-neutral-600 whitespace-nowrap max-w-[180px] overflow-hidden"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: TYPE_COLOR[fileKind(doc)] }}
                      />
                      <IconDocFile size={12} />
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {doc.name}
                      </span>
                      <button
                        type="button"
                        className="ml-0.5 p-0.5 rounded-full hover:bg-neutral-200 transition-colors bg-transparent border-none cursor-pointer text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                        aria-label={`Remove ${doc.name}`}
                        onClick={() =>
                          setQuotedDocs((prev) => prev.filter((d) => d.id !== doc.id))
                        }
                      >
                        <IconClose size={8} />
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className={`flex items-center justify-center w-8 h-8 border-none rounded-8 cursor-pointer transition-all duration-200 shrink-0 ${
                    chatInput.trim() || quotedDocs.length
                      ? 'bg-primary-base text-white hover:bg-primary-darker hover:scale-105'
                      : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                  }`}
                  onClick={handleChatSubmit}
                  disabled={!chatInput.trim() && quotedDocs.length === 0}
                  aria-label="Start chat"
                >
                  <IconArrowUp size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-neutral-400 text-center max-w-[700px] leading-[1.6] mt-3 mb-0">
          Script AI only provides insights based on your uploaded documents.
        </p>
      </div>

      {contextMenu && (
        <div
          className="fixed inset-0 z-[300]"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="absolute bg-white rounded-12 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.xl)] p-1 min-w-[160px]"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 180),
              left: Math.min(contextMenu.x, window.innerWidth - 180),
            }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <p className="text-subheading-sm text-neutral-400 px-2 pt-2 pb-1 truncate max-w-[200px]">
              {contextMenu.target.item.name}
            </p>
            <button
              type="button"
              role="menuitem"
              className="flex items-center w-full p-[8px_10px] text-left text-para-sm text-neutral-950 bg-transparent border-none rounded-8 cursor-pointer hover:bg-neutral-50"
              onClick={() => {
                setRenameState(contextMenu.target);
                setContextMenu(null);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex items-center w-full p-[8px_10px] text-left text-para-sm text-neutral-950 bg-transparent border-none rounded-8 cursor-pointer hover:bg-neutral-50"
              onClick={() => {
                const t = contextMenu.target;
                setMoveTargetId(
                  t.kind === 'folder' ? t.item.parentId : t.item.folderId,
                );
                setMoveState(t);
                setContextMenu(null);
              }}
            >
              Move to…
            </button>
            {contextMenu.target.kind === 'file' &&
            (contextMenu.target.item.status === 'failed' ||
              contextMenu.target.item.status === 'ready') ? (
              <button
                type="button"
                role="menuitem"
                className="flex items-center w-full p-[8px_10px] text-left text-para-sm text-neutral-950 bg-transparent border-none rounded-8 cursor-pointer hover:bg-neutral-50"
                onClick={() => {
                  const target = contextMenu.target;
                  if (target.kind === 'file') void retryDocument(target.item);
                }}
              >
                {contextMenu.target.item.status === 'failed' ? 'Retry processing' : 'Reprocess'}
              </button>
            ) : null}
            {contextMenu.target.kind === 'file' ? (
              <button
                type="button"
                role="menuitem"
                className="flex items-center w-full p-[8px_10px] text-left text-para-sm text-neutral-950 bg-transparent border-none rounded-8 cursor-pointer hover:bg-neutral-50"
                onClick={() => {
                  const target = contextMenu.target;
                  if (target.kind === 'file') {
                    setVersionsDoc(target.item);
                    setContextMenu(null);
                  }
                }}
              >
                Version history
              </button>
            ) : null}
            <div className="h-px bg-neutral-200 my-1" />
            <button
              type="button"
              role="menuitem"
              className="flex items-center w-full p-[8px_10px] text-left text-para-sm text-error-base bg-transparent border-none rounded-8 cursor-pointer hover:bg-red-500/10"
              onClick={() => {
                setDeleteState(contextMenu.target);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <SideDrawer open={Boolean(previewId)} onOpenChange={(open) => !open && setPreviewId(null)}>
        <SideDrawerContent showClose={false} width="md" className="p-0" accessibleTitle="Document preview">
          <DocumentCanvas
            file={{
              id: previewId ?? '',
              name: previewQuery.data?.name ?? previewListDocument?.name ?? 'Document',
              status: previewQuery.data?.status ?? previewListDocument?.status,
              mimeType: previewQuery.data?.mimeType ?? previewListDocument?.mimeType,
            }}
            content={previewQuery.data?.extractedText ?? null}
            downloadUrl={previewQuery.data?.downloadUrl ?? null}
            loading={previewLoading}
            onClose={() => setPreviewId(null)}
          />
        </SideDrawerContent>
      </SideDrawer>

      <Modal open={Boolean(versionsDoc)} onOpenChange={(open) => !open && setVersionsDoc(null)}>
        <ModalContent className="max-w-lg" size="lg">
          <ModalHeader title="Version history" align="start" />
          <ModalIllustration>
            <ModalIllustrationRename />
          </ModalIllustration>
          <ModalBody align="start">
            {versionsDoc
              ? `Past versions of ${versionsDoc.name}. Restoring creates a new version; history is never rewritten.`
              : 'Browse and restore earlier versions of this document.'}
          </ModalBody>
          <div className="max-h-[360px] overflow-y-auto space-y-2 text-left">
            {versionsQuery.isLoading ? (
              <LoadingState label="Loading versions…" />
            ) : versionsQuery.isError ? (
              <ErrorState
                message={getErrorMessage(versionsQuery.error, 'Could not load versions')}
                onRetry={() => void versionsQuery.refetch()}
              />
            ) : (versionsQuery.data ?? []).length === 0 ? (
              <EmptyState
                title="No versions yet"
                description="Process this file to create the first version."
              />
            ) : (
              (versionsQuery.data ?? []).map((version) => (
                <div
                  key={version.id}
                  className="flex items-start justify-between gap-3 rounded-12 border border-neutral-200 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-label-sm text-neutral-950">v{version.versionNumber}</span>
                      {version.isCurrent ? (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary-alpha-10 text-primary-base">
                          Current
                        </span>
                      ) : null}
                      <span className="text-[11px] text-neutral-500 capitalize">{version.status}</span>
                      <span className="text-[11px] text-neutral-400 capitalize">
                        {version.changeReason}
                      </span>
                    </div>
                    <p className="text-para-sm text-neutral-500 mt-0.5">
                      {new Date(version.createdAt).toLocaleString()}
                      {version.failureReason
                        ? ` · ${humanizeIngestionFailure(version.failureReason)}`
                        : ''}
                    </p>
                  </div>
                  {version.status === 'ready' && !version.isCurrent ? (
                    <Button
                      variant="neutral"
                      mode="stroke"
                      size="xs"
                      className="w-fit shrink-0"
                      disabled={Boolean(rollbackBusyId)}
                      loading={rollbackBusyId === version.id}
                      onClick={() => void restoreVersion(version.id)}
                    >
                      Restore
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <ModalFooter>
            <Button variant="neutral" mode="stroke" className="w-fit" onClick={() => setVersionsDoc(null)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <FormModal
        open={folderModalOpen}
        onOpenChange={(open) => {
          if (!open && !folderBusy) setFolderModalOpen(false);
        }}
        title="New folder"
        badge="New"
        description="Give this folder a clear name so it’s easy to find later."
        label="Folder name"
        placeholder="e.g. Contracts"
        confirmLabel="Create"
        footerAlign="center"
        loading={folderBusy}
        onSubmit={async (name) => {
          setFolderBusy(true);
          try {
            await mutations.createFolder.mutateAsync({
              name,
              parentId: currentFolderId,
            });
            notify.success('Folder created');
            setFolderModalOpen(false);
          } catch (err) {
            notify.error(getErrorMessage(err, 'Could not create folder'));
          } finally {
            setFolderBusy(false);
          }
        }}
      />

      <FormModal
        open={urlModalOpen}
        onOpenChange={(open) => {
          if (!open && !urlBusy) {
            setUrlModalOpen(false);
            setUrlValue('');
          }
        }}
        title="Import from URL"
        description="Paste a direct link to a PDF or document — we’ll pull it into this library for you."
        illustration={<ModalIllustrationLink />}
        label="Document URL"
        placeholder="https://example.com/document.pdf"
        initialValue={urlValue}
        confirmLabel="Import"
        loading={urlBusy}
        onSubmit={async (url) => {
          setUrlBusy(true);
          try {
            await mutations.importUrl.mutateAsync({
              url,
              folderId: currentFolderId,
            });
            notify.success('Import started');
            setUrlModalOpen(false);
            setUrlValue('');
          } catch (err) {
            notify.error(getErrorMessage(err, 'Import failed'));
          } finally {
            setUrlBusy(false);
          }
        }}
      />

      <FormModal
        open={Boolean(renameState)}
        onOpenChange={(open) => {
          if (!open && !renameBusy) setRenameState(null);
        }}
        title={renameState?.kind === 'folder' ? 'Rename folder' : 'Rename file'}
        illustration={<ModalIllustrationRename />}
        label="Name"
        initialValue={renameState?.item.name ?? ''}
        confirmLabel="Save"
        loading={renameBusy}
        onSubmit={submitRename}
      />

      <Modal
        open={Boolean(moveState)}
        onOpenChange={(open) => {
          if (!open && !moveBusy) setMoveState(null);
        }}
      >
        <ModalContent showClose={!moveBusy}>
          <ModalHeader
            title={moveState?.kind === 'folder' ? 'Move folder' : 'Move file'}
          />
          <ModalIllustration>
            <ModalIllustrationMove />
          </ModalIllustration>
          <ModalBody>
            {`Pick where “${moveState?.item.name ?? 'this item'}” should live. You can always move it again later.`}
          </ModalBody>
          <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto text-left">
            <button
              type="button"
              className={`text-left px-3 py-2.5 rounded-10 border-none cursor-pointer text-para-sm transition-colors ${
                moveTargetId === null
                  ? 'bg-primary-alpha-10 text-primary-base font-medium'
                  : 'bg-transparent text-neutral-700 hover:bg-neutral-50'
              }`}
              onClick={() => setMoveTargetId(null)}
            >
              Library (root)
            </button>
            {moveFolders
              .filter((f) => !(moveState?.kind === 'folder' && f.id === moveState.item.id))
              .map((folder) => (
                <button
                  type="button"
                  key={folder.id}
                  className={`text-left px-3 py-2.5 rounded-10 border-none cursor-pointer text-para-sm transition-colors ${
                    moveTargetId === folder.id
                      ? 'bg-primary-alpha-10 text-primary-base font-medium'
                      : 'bg-transparent text-neutral-700 hover:bg-neutral-50'
                  }`}
                  onClick={() => setMoveTargetId(folder.id)}
                >
                  {folder.name}
                </button>
              ))}
          </div>
          <ModalFooter>
            <Button
              type="button"
              size="sm"
              variant="neutral"
              mode="stroke"
              disabled={moveBusy}
              onClick={() => setMoveState(null)}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" loading={moveBusy} onClick={() => void submitMove()}>
              Move
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteState)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteState(null);
        }}
        title={deleteState?.kind === 'folder' ? 'Delete folder?' : 'Delete file?'}
        description={
          deleteState?.kind === 'folder'
            ? `Are you sure you want to delete “${deleteState.item.name}”? Empty it first — once it’s gone, it’s gone for good.`
            : `Are you sure you want to delete “${deleteState?.item.name ?? 'this file'}”? This can’t be undone, so only continue if you’re certain.`
        }
        illustration={<ModalIllustrationDelete />}
        confirmLabel="Delete"
        destructive
        loading={deleteBusy}
        onConfirm={submitDelete}
      />

      <CloudImportModal
        open={cloudImportOpen}
        onOpenChange={(open) => {
          setCloudImportOpen(open);
          if (!open) setCloudProvider(null);
        }}
        folderId={currentFolderId}
        initialProvider={cloudProvider}
      />

      <Modal open={addModalOpen} onOpenChange={setAddModalOpen}>
        <ModalContent size="md">
          <ModalHeader title="Add to library" />
          <ModalIllustration>
            <ModalIllustrationAdd />
          </ModalIllustration>
          <ModalBody>
            Drop something new into this library — a folder, files, a link, or a cloud import.
          </ModalBody>
          <div className="flex flex-col gap-1 text-left">
            <button
              type="button"
              className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-12 border-none bg-transparent cursor-pointer hover:bg-neutral-50 transition-colors"
              onClick={() => {
                setAddModalOpen(false);
                setFolderModalOpen(true);
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-10 bg-neutral-100 text-neutral-700">
                <IconFolderSimple size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-label-sm text-neutral-950">New folder</span>
                <span className="block text-para-xs text-neutral-400">Organize documents</span>
              </span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-12 border-none bg-transparent cursor-pointer hover:bg-neutral-50 transition-colors"
              disabled={Boolean(activeProgress)}
              onClick={() => {
                setAddModalOpen(false);
                fileInputRef.current?.click();
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-10 bg-neutral-100 text-neutral-700">
                <IconUpload size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-label-sm text-neutral-950">Upload a file</span>
                <span className="block text-para-xs text-neutral-400">PDF, Word, images, and more</span>
              </span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-12 border-none bg-transparent cursor-pointer hover:bg-neutral-50 transition-colors"
              disabled={Boolean(activeProgress)}
              onClick={() => {
                setAddModalOpen(false);
                folderInputRef.current?.click();
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-10 bg-neutral-100 text-neutral-700">
                <IconFolderSimple size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-label-sm text-neutral-950">Upload a folder</span>
                <span className="block text-para-xs text-neutral-400">
                  Choose a folder from your computer
                </span>
              </span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-12 border-none bg-transparent cursor-pointer hover:bg-neutral-50 transition-colors"
              onClick={() => {
                setAddModalOpen(false);
                setUrlModalOpen(true);
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-10 bg-neutral-100 text-neutral-700">
                <IconFile size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-label-sm text-neutral-950">Import from URL</span>
                <span className="block text-para-xs text-neutral-400">Paste a direct document link</span>
              </span>
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100">
            <p className="text-subheading-sm text-neutral-400 tracking-[0.06em] m-0 mb-2 px-1">
              Integrations
            </p>
            <div className="flex flex-col gap-1">
              {ALL_PROVIDERS.map((provider) => {
                const connected = connectedProviders.has(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-12 border-none bg-transparent cursor-pointer hover:bg-neutral-50 transition-colors"
                    onClick={() => {
                      setAddModalOpen(false);
                      if (!connected) {
                        void integrationMutations.connect
                          .mutateAsync(provider)
                          .then((data) => {
                            window.location.assign(data.url);
                          })
                          .catch((err) =>
                            notify.error(getErrorMessage(err, 'Could not start connect')),
                          );
                        return;
                      }
                      setCloudProvider(provider);
                      setCloudImportOpen(true);
                    }}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-10 bg-neutral-100 text-neutral-700">
                      <IconDocFile size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-label-sm text-neutral-950">
                        {PROVIDER_LABELS[provider]}
                      </span>
                      <span className="block text-para-xs text-neutral-400">
                        {connected ? 'Import from cloud' : 'Connect account'}
                      </span>
                    </span>
                    <span
                      className={`text-[11px] shrink-0 ${connected ? 'text-success-base' : 'text-neutral-400'}`}
                    >
                      {connected ? 'Connected' : 'Not connected'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <ModalFooter>
            <Button variant="neutral" mode="stroke" className="w-fit" onClick={() => setAddModalOpen(false)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <SideDrawer open={queueOpen} onOpenChange={setQueueOpen}>
        <SideDrawerContent width="sm">
          <SideDrawerHeader
            title="Upload queue"
            description="Uploads, processing, and failures for this library."
          />
          <SideDrawerBody className="px-4 py-3">
            {queueItems.length === 0 ? (
              <EmptyState
                title="Queue is empty"
                description="Uploads and processing jobs will show up here."
              />
            ) : (
              <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                {queueItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-12 border border-neutral-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-label-sm text-neutral-950 m-0 truncate">{item.name}</p>
                        <p
                          className={`text-para-xs m-0 mt-0.5 ${
                            item.status === 'failed'
                              ? 'text-error-base'
                              : item.status === 'ready'
                                ? 'text-success-base'
                                : 'text-neutral-500'
                          }`}
                        >
                          {queueStatusLabel(item)}
                        </p>
                      </div>
                      {item.status === 'failed' && item.documentId ? (
                        <Button
                          size="xs"
                          variant="neutral"
                          mode="stroke"
                          className="w-fit shrink-0"
                          onClick={() => {
                            const doc = (documentsQuery.data ?? []).find(
                              (d) => d.id === item.documentId,
                            );
                            if (doc) void retryDocument(doc);
                          }}
                        >
                          Retry
                        </Button>
                      ) : null}
                    </div>
                    {(item.status === 'uploading' || item.status === 'processing') && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className={`h-full rounded-full bg-primary-base ${
                            typeof item.percent !== 'number' ? 'w-1/2 animate-pulse' : ''
                          }`}
                          style={
                            typeof item.percent === 'number'
                              ? { width: `${Math.min(100, Math.max(0, item.percent))}%` }
                              : undefined
                          }
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SideDrawerBody>
        </SideDrawerContent>
      </SideDrawer>
    </div>
  );
}
