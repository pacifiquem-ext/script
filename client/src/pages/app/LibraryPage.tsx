import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PublicDocument, PublicFolder } from '@script/shared';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';
import { CloudImportModal } from '../../components/app/CloudImportModal';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { IconFolderSimple, IconPlus, IconUpload, IconFile, IconSearch } from '../../lib/icons';
import { useCredits } from '../../lib/chat-api';
import { getErrorMessage } from '../../lib/form-errors';
import { useDocument, useDocuments, useFolders, useLibraryMutations } from '../../lib/library-api';
import { Alert } from '../../components/ui/Alert';
import { FormModal } from '../../components/ui/FormModal';
import { notify } from '../../components/ui/toast-alert';

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [parentId, setParentId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [cloudImportOpen, setCloudImportOpen] = useState(false);

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
  const listRef = useRef<HTMLDivElement>(null);
  const foldersQuery = useFolders(parentId);
  const documentsQuery = useDocuments(selectedFolderId);
  const previewQuery = useDocument(previewId);
  const mutations = useLibraryMutations();
  const credits = useCredits();
  const folders = foldersQuery.data ?? [];
  const documents = documentsQuery.data ?? [];

  const rowVirtualizer = useVirtualizer({
    count: documents.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  async function onUpload(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (!files.length) return;
    setError(null);
    try {
      for (const file of files) {
        await mutations.uploadFile.mutateAsync({ file, folderId: selectedFolderId });
      }
      notify.success(files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`);
    } catch (err) {
      const message = getErrorMessage(err, 'Upload failed');
      setError(message);
      notify.error(message);
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
    await onUpload(e.dataTransfer.files);
  }

  return (
    <div
      className="flex h-full overflow-hidden bg-white relative"
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={onDrag}
      onDrop={(e) => void onDrop(e)}
    >
      {dragActive && (
        <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-[2px] border-2 border-dashed border-primary-base rounded-20 m-3 flex items-center justify-center pointer-events-none">
          <p className="text-label-sm text-primary-base">Drop files to upload</p>
        </div>
      )}

      <aside
        className="w-[260px] border-r border-neutral-200 flex flex-col max-md:w-[200px]"
        aria-label="Folders"
      >
        <div className="p-3 flex items-center justify-between gap-2">
          <p className="text-label-sm text-neutral-950">Library</p>
          <Button size="xs" aria-label="Create folder" onClick={() => setFolderModalOpen(true)}>
            <IconPlus size={14} /> New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          <button
            type="button"
            className={`text-left px-2 py-2 rounded-8 text-para-sm ${selectedFolderId === null ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-600 hover:bg-neutral-50'}`}
            onClick={() => setSelectedFolderId(null)}
          >
            All files
          </button>
          {folders.map((folder: PublicFolder) => (
            <button
              type="button"
              key={folder.id}
              className={`flex items-center gap-2 text-left px-2 py-2 rounded-8 text-para-sm ${selectedFolderId === folder.id ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-600 hover:bg-neutral-50'}`}
              onClick={() => setSelectedFolderId(folder.id)}
              onDoubleClick={() => setParentId(folder.id)}
            >
              <IconFolderSimple size={16} />
              <span className="truncate flex-1">{folder.name}</span>
              <span className="text-para-xs text-neutral-400">{folder.documentCount}</span>
            </button>
          ))}
        </div>
        {parentId && (
          <button
            type="button"
            className="m-2 text-para-sm text-primary-base"
            onClick={() => setParentId(null)}
          >
            Back to root folders
          </button>
        )}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-neutral-200 flex items-center gap-3 flex-wrap">
          <p className="text-label-sm text-neutral-950 flex-1">
            {selectedFolderId ? 'Selected folder' : 'All files'}
          </p>
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void onUpload(e.target.files)}
            />
            <span className="inline-flex items-center gap-1 h-8 px-3 rounded-8 bg-primary-base text-white text-xs font-medium">
              <IconUpload size={14} /> Upload
            </span>
          </label>
        </div>

        <div className="p-4 flex gap-2 border-b border-neutral-100 flex-wrap">
          <div className="flex-1 min-w-[200px] flex items-center gap-2 border border-neutral-200 rounded-10 px-3 h-10">
            <IconSearch size={14} className="text-neutral-400" />
            <input
              className="flex-1 border-none outline-none text-para-sm"
              placeholder="Import from URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Document URL"
            />
          </div>
          <Button
            size="sm"
            loading={mutations.importUrl.isPending}
            onClick={() => {
              if (!url.trim()) return;
              setError(null);
              void mutations.importUrl
                .mutateAsync({ url: url.trim(), folderId: selectedFolderId })
                .then(() => {
                  setUrl('');
                  notify.success('Import started');
                })
                .catch((err) => {
                  const message = getErrorMessage(err);
                  setError(message);
                  notify.error(message);
                });
            }}
          >
            Import URL
          </Button>
          <Button
            size="sm"
            variant="neutral"
            mode="stroke"
            onClick={() => setCloudImportOpen(true)}
          >
            Cloud import
          </Button>
        </div>

        {error ? (
          <div className="px-4 pt-3">
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

        {foldersQuery.isLoading || documentsQuery.isLoading ? (
          <LoadingState label="Loading library…" />
        ) : documentsQuery.isError ? (
          <ErrorState
            message="Failed to load documents"
            onRetry={() => void documentsQuery.refetch()}
          />
        ) : documents.length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Drag and drop files here, browse to upload, or import from a URL."
            action={
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => void onUpload(e.target.files)}
                />
                <span className="inline-flex h-9 px-3 items-center rounded-8 bg-primary-base text-white text-sm">
                  Upload files
                </span>
              </label>
            }
          />
        ) : (
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto p-4"
            role="list"
            aria-label="Documents"
          >
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const doc = documents[virtualRow.index] as PublicDocument;
                return (
                  <div
                    key={doc.id}
                    role="listitem"
                    className="absolute left-0 right-0 px-0"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      height: `${virtualRow.size}px`,
                    }}
                  >
                    <div
                      className="flex items-center gap-3 p-3 mx-0 mb-2 rounded-12 border border-neutral-200 hover:bg-neutral-50"
                      draggable={doc.status === 'ready'}
                      onDragStart={(e) => {
                        if (doc.status !== 'ready') return;
                        e.dataTransfer.setData('application/x-script-document-id', doc.id);
                        e.dataTransfer.setData('application/x-script-document-name', doc.name);
                      }}
                    >
                      <IconFile size={18} className="text-neutral-400 shrink-0" />
                      <button
                        type="button"
                        className="flex-1 text-left bg-transparent border-none cursor-pointer min-w-0"
                        onClick={() => setPreviewId(doc.id)}
                      >
                        <p className="text-label-sm text-neutral-950 truncate">{doc.name}</p>
                        <p className="text-para-xs text-neutral-400 capitalize">
                          {doc.status}
                          {doc.status === 'processing' && doc.processingPhase
                            ? ` (${doc.processingPhase})`
                            : ''}
                          {doc.failureReason ? ` — ${doc.failureReason}` : ''}
                        </p>
                      </button>
                      <Button
                        size="xs"
                        variant="neutral"
                        mode="ghost"
                        aria-label={`Delete ${doc.name}`}
                        onClick={() =>
                          void mutations.deleteDocument
                            .mutateAsync(doc.id)
                            .catch((err) => setError(getErrorMessage(err)))
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="p-4 border-t border-neutral-200">
          <p className="text-para-xs text-neutral-500 mb-2">
            Credits:{' '}
            <span className="text-primary-base font-semibold">
              {credits.data?.balance?.toLocaleString() ?? '—'}
            </span>
          </p>
          <div className="flex gap-2 flex-col sm:flex-row">
            <input
              className="flex-1 h-10 px-3 border border-neutral-200 rounded-10 text-para-sm outline-none focus:border-primary-base"
              placeholder="Ask about your library…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && chatInput.trim()) {
                  navigate('/app/chat', { state: { initialMessage: chatInput.trim() } });
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                if (!chatInput.trim()) return;
                navigate('/app/chat', { state: { initialMessage: chatInput.trim() } });
              }}
            >
              Chat
            </Button>
          </div>
        </div>
      </main>

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
            await mutations.createFolder.mutateAsync({ name, parentId });
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
      <CloudImportModal
        open={cloudImportOpen}
        onOpenChange={setCloudImportOpen}
        folderId={selectedFolderId}
      />
    </div>
  );
}
