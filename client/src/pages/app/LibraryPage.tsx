import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { PublicDocument, PublicFolder } from '@script/shared';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';
import { CloudImportModal } from '../../components/app/CloudImportModal';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { FormModal } from '../../components/ui/FormModal';
import { LoadingState } from '../../components/ui/LoadingState';
import { Modal, ModalContent, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import { notify } from '../../components/ui/toast-alert';
import { useCredits } from '../../lib/chat-api';
import { getErrorMessage } from '../../lib/form-errors';
import {
  IconArrowUp,
  IconAttach,
  IconClose,
  IconDocFile,
  IconGrid,
  IconMenu,
  IconMore,
  IconPlus,
  IconSearch,
  IconUpload,
  IconZap,
} from '../../lib/icons';
import { useDocument, useDocuments, useFolders, useLibraryMutations } from '../../lib/library-api';

type ViewMode = 'grid' | 'list';
type FileKind = 'pdf' | 'doc' | 'xls' | 'txt' | 'img' | 'other';

type PathCrumb = { id: string; name: string };

type ContextTarget =
  | { kind: 'folder'; item: PublicFolder }
  | { kind: 'file'; item: PublicDocument };

const TYPE_COLOR: Record<FileKind, string> = {
  pdf: '#e54d2e',
  doc: '#0070f3',
  xls: '#1a7f3c',
  txt: '#737373',
  img: '#7c3aed',
  other: '#737373',
};

const TYPE_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  doc: 'DOC',
  xls: 'XLS',
  txt: 'TXT',
  img: 'IMG',
  other: 'FILE',
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
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function statusLabel(doc: PublicDocument): string | null {
  if (doc.status === 'ready') return null;
  if (doc.status === 'processing' && doc.processingPhase) return `Processing (${doc.processingPhase})`;
  if (doc.status === 'failed') return doc.failureReason ? `Failed — ${doc.failureReason}` : 'Failed';
  return doc.status.charAt(0).toUpperCase() + doc.status.slice(1);
}

function FolderIcon({ name }: { name: string }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || 'FO';
  return (
    <div className="relative w-[80px] h-[68px] shrink-0">
      <div className="absolute top-0 left-[6px] right-0 h-[52px] bg-neutral-400 rounded-[0_10px_10px_10px] before:content-[''] before:absolute before:-top-2 before:left-0 before:w-[36px] before:h-3 before:bg-neutral-400 before:rounded-[4px_4px_0_0]" />
      <div className="absolute top-[10px] left-0 right-[6px] h-[52px] bg-neutral-500 rounded-8 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
        <div className="text-[14px] font-bold text-white/50 tracking-[0.05em]">{initials}</div>
      </div>
    </div>
  );
}

function SmallFolderIcon() {
  return (
    <div className="relative w-8 h-8 shrink-0">
      <div className="absolute top-1 left-0 right-0 bottom-0 bg-neutral-500 rounded-[2px_6px_6px_6px] before:content-[''] before:absolute before:-top-1 before:left-0 before:w-3 before:h-2 before:bg-neutral-400 before:rounded-[2px_2px_0_0]" />
    </div>
  );
}

function FileIcon({ kind }: { kind: FileKind }) {
  return (
    <div className="w-[60px] h-[72px] relative shrink-0">
      <div className="w-full h-full bg-white border-[1.5px] border-neutral-200 rounded-6 relative flex items-center justify-center shadow-sm">
        <div className="absolute top-0 right-0 w-[18px] h-[18px] bg-neutral-50 border-l-[1.5px] border-b-[1.5px] border-neutral-200 rounded-[0_6px_0_4px]" />
        <span
          className="text-[10px] font-bold tracking-[0.04em] mt-2"
          style={{ color: TYPE_COLOR[kind] }}
        >
          {TYPE_LABEL[kind]}
        </span>
      </div>
    </div>
  );
}

function SmallFileIcon({ kind }: { kind: FileKind }) {
  return (
    <div className="w-8 h-8 bg-white border border-neutral-200 rounded-4 relative flex items-center justify-center shadow-sm shrink-0">
      <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-neutral-50 border-l border-b border-neutral-200 rounded-[0_3px_0_2px]" />
      <span
        className="text-[6px] font-bold tracking-[0.04em] mt-1"
        style={{ color: TYPE_COLOR[kind] }}
      >
        {TYPE_LABEL[kind]}
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
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [cloudImportOpen, setCloudImportOpen] = useState(false);
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

  const [chatInput, setChatInput] = useState('');
  const [quotedDocs, setQuotedDocs] = useState<PublicDocument[]>([]);
  const [chatDropActive, setChatDropActive] = useState(false);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string;
    fileIndex: number;
    fileTotal: number;
    percent: number;
  } | null>(null);

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
  const mutations = useLibraryMutations();
  const credits = useCredits();

  const moveFolders = rootFoldersQuery.data ?? [];

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

  async function onUpload(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (!files.length) return;
    if (uploadProgress) return;
    setError(null);
    const total = files.length;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        setUploadProgress({
          fileName: file.name,
          fileIndex: i + 1,
          fileTotal: total,
          percent: 0,
        });
        await mutations.uploadFile.mutateAsync({
          file,
          folderId: currentFolderId,
          onProgress: (percent) => {
            setUploadProgress((prev) =>
              prev && prev.fileName === file.name && prev.fileIndex === i + 1
                ? { ...prev, percent }
                : prev,
            );
          },
        });
        setUploadProgress((prev) =>
          prev && prev.fileIndex === i + 1 ? { ...prev, percent: 100 } : prev,
        );
      }
      notify.success(total === 1 ? 'File uploaded' : `${total} files uploaded`);
    } catch (err) {
      const message = getErrorMessage(err, 'Upload failed');
      setError(message);
      notify.error(message);
    } finally {
      setUploadProgress(null);
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
      const message = getErrorMessage(err, 'Rename failed');
      setError(message);
      notify.error(message);
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
      const message = getErrorMessage(err, 'Move failed');
      setError(message);
      notify.error(message);
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
      const message = getErrorMessage(err, 'Delete failed');
      setError(message);
      notify.error(message);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function retryDocument(doc: PublicDocument) {
    setContextMenu(null);
    try {
      await mutations.reprocessDocument.mutateAsync(doc.id);
      notify.success(`Reprocessing ${doc.name}`);
    } catch (err) {
      const message = getErrorMessage(err, 'Could not reprocess file');
      setError(message);
      notify.error(message);
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
        disabled={Boolean(uploadProgress)}
        onChange={(e) => {
          void onUpload(e.target.files);
          e.target.value = '';
        }}
      />

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
                onClick={() => setFolderModalOpen(true)}
              >
                <IconPlus size={14} /> New Folder
              </Button>
              <Button size="xs" variant="neutral" mode="stroke" onClick={() => setUrlModalOpen(true)}>
                Import URL
              </Button>
              <Button
                size="xs"
                variant="neutral"
                mode="stroke"
                onClick={() => setCloudImportOpen(true)}
              >
                Cloud
              </Button>
              <Button
                size="xs"
                loading={Boolean(uploadProgress)}
                disabled={Boolean(uploadProgress)}
                leftIcon={uploadProgress ? undefined : <IconUpload size={14} />}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadProgress ? 'Uploading…' : 'Upload'}
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

        {error ? (
          <div className="relative z-20">
            <Alert
              status="error"
              variant="stroke"
              title="Library error"
              description={error}
              onDismiss={() => setError(null)}
              compact
            />
          </div>
        ) : null}

        {uploadProgress ? (
          <div
            className="relative z-20 rounded-12 border border-neutral-200 bg-white p-3 shadow-sm"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-label-sm text-neutral-950 m-0 truncate">
                  Uploading {uploadProgress.fileName}
                </p>
                <p className="text-para-xs text-neutral-400 m-0 mt-0.5">
                  {uploadProgress.fileTotal > 1
                    ? `File ${uploadProgress.fileIndex} of ${uploadProgress.fileTotal} · ${uploadProgress.percent}%`
                    : `${uploadProgress.percent}%`}
                </p>
              </div>
              <span className="text-label-sm text-primary-base font-semibold tabular-nums shrink-0">
                {(() => {
                  const overall =
                    ((uploadProgress.fileIndex - 1 + uploadProgress.percent / 100) /
                      uploadProgress.fileTotal) *
                    100;
                  return `${Math.round(overall)}%`;
                })()}
              </span>
            </div>
            <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-base rounded-full transition-[width] duration-150 ease-out"
                style={{
                  width: `${Math.min(
                    100,
                    ((uploadProgress.fileIndex - 1 + uploadProgress.percent / 100) /
                      uploadProgress.fileTotal) *
                      100,
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}

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
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 max-md:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]">
                  {displayFolders.map((folder) => (
                    <div
                      key={folder.id}
                      role="button"
                      tabIndex={0}
                      className="group flex flex-col items-center gap-2 p-[16px_12px] bg-transparent border-none cursor-pointer font-sans rounded-12 transition-colors duration-200 text-center hover:bg-neutral-50 relative"
                      onClick={() => openFolder(folder)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openFolder(folder);
                        }
                      }}
                      onContextMenu={(e) => openContext(e, { kind: 'folder', item: folder })}
                    >
                      <FolderIcon name={folder.name} />
                      <p className="text-label-sm text-neutral-950 mt-[2px] truncate w-full px-2 m-0">
                        {folder.name}
                      </p>
                      <p className="text-para-xs text-neutral-400 m-0">
                        {folder.documentCount} file{folder.documentCount === 1 ? '' : 's'}
                      </p>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreButton onOpen={(e) => openContext(e, { kind: 'folder', item: folder })} />
                      </div>
                    </div>
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
                      <SmallFolderIcon />
                      <span className="text-label-sm text-neutral-950 flex-1 truncate">
                        {folder.name}
                      </span>
                      <span className="text-para-xs text-neutral-400 w-24">
                        {folder.documentCount} file{folder.documentCount === 1 ? '' : 's'}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreButton onOpen={(e) => openContext(e, { kind: 'folder', item: folder })} />
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
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
                  {displayFiles.map((doc) => {
                    const kind = fileKind(doc);
                    const status = statusLabel(doc);
                    return (
                      <div
                        key={doc.id}
                        role="button"
                        tabIndex={0}
                        draggable={doc.status === 'ready'}
                        onDragStart={(e) => onFileDragStart(e, doc)}
                        className="group flex flex-col items-center gap-2 p-[16px_12px] bg-transparent border-none cursor-pointer font-sans rounded-12 transition-colors duration-200 text-center hover:bg-neutral-50 relative"
                        onClick={() => setPreviewId(doc.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPreviewId(doc.id);
                          }
                        }}
                        onContextMenu={(e) => openContext(e, { kind: 'file', item: doc })}
                      >
                        <div className="flex items-center justify-center">
                          <FileIcon kind={kind} />
                        </div>
                        <p className="text-label-sm text-neutral-950 text-[12px] break-words leading-[1.4] max-w-[120px] line-clamp-2 m-0">
                          {doc.name}
                        </p>
                        <p
                          className={`text-[11px] m-0 ${
                            doc.status === 'failed'
                              ? 'text-error-base'
                              : doc.status === 'pending' || doc.status === 'processing'
                                ? 'text-primary-base'
                                : 'text-neutral-400'
                          }`}
                        >
                          {status ?? `${formatBytes(doc.byteSize)} · ${formatDate(doc.createdAt)}`}
                        </p>
                        {(doc.status === 'pending' || doc.status === 'processing') && (
                          <div className="w-[72px] h-1 bg-neutral-100 rounded-full overflow-hidden mt-0.5">
                            <div className="h-full w-1/2 bg-primary-base rounded-full animate-pulse" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreButton onOpen={(e) => openContext(e, { kind: 'file', item: doc })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col border border-neutral-200 rounded-12 overflow-hidden bg-white">
                  {displayFiles.map((doc) => {
                    const kind = fileKind(doc);
                    const status = statusLabel(doc);
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
                          {(doc.status === 'pending' || doc.status === 'processing') && (
                            <div className="h-1 w-full max-w-[160px] bg-neutral-100 rounded-full overflow-hidden mt-1">
                              <div className="h-full w-1/2 bg-primary-base rounded-full animate-pulse" />
                            </div>
                          )}
                        </div>
                        <span
                          className={`text-para-xs w-28 hidden md:block truncate ${
                            doc.status === 'failed'
                              ? 'text-error-base'
                              : doc.status === 'pending' || doc.status === 'processing'
                                ? 'text-primary-base'
                                : 'text-neutral-400'
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
        className="shrink-0 flex flex-col items-center px-4 pt-3 pb-4 bg-white border-t border-neutral-100 z-[100]"
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

      {previewId && (
        <DocumentCanvas
          file={{
            id: previewId,
            name: previewQuery.data?.name || 'Document',
            status: previewQuery.data?.status,
            mimeType: previewQuery.data?.mimeType,
          }}
          content={previewQuery.data?.extractedText ?? null}
          downloadUrl={previewQuery.data?.downloadUrl ?? null}
          loading={previewQuery.isLoading}
          onClose={() => setPreviewId(null)}
        />
      )}

      <FormModal
        open={folderModalOpen}
        onOpenChange={(open) => {
          if (!open && !folderBusy) setFolderModalOpen(false);
        }}
        title="New folder"
        description="Organize documents inside your library."
        label="Folder name"
        placeholder="e.g. Contracts"
        confirmLabel="Create"
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
            const message = getErrorMessage(err, 'Could not create folder');
            setError(message);
            notify.error(message);
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
        description="Paste a direct link to a PDF or document."
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
            const message = getErrorMessage(err, 'Import failed');
            setError(message);
            notify.error(message);
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
            description={`Choose a destination for “${moveState?.item.name ?? ''}”.`}
          />
          <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto">
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
          <ModalFooter className="mt-3">
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
            ? `“${deleteState.item.name}” must be empty. This cannot be undone.`
            : `“${deleteState?.item.name ?? ''}” will be permanently removed.`
        }
        confirmLabel="Delete"
        destructive
        loading={deleteBusy}
        onConfirm={submitDelete}
      />

      <CloudImportModal
        open={cloudImportOpen}
        onOpenChange={setCloudImportOpen}
        folderId={currentFolderId}
      />
    </div>
  );
}
