import React, { useEffect, useMemo, useState } from 'react';
import type { IntegrationProvider } from '@script/shared';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { Alert } from '../ui/Alert';
import {
  PROVIDER_LABELS,
  useCloudFiles,
  useIntegrationMutations,
  useIntegrations,
} from '../../lib/integrations-api';
import { getErrorMessage } from '../../lib/form-errors';
import { notify } from '../ui/toast-alert';

export function CloudImportModal({
  open,
  onOpenChange,
  folderId,
  initialProvider = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string | null;
  initialProvider?: IntegrationProvider | null;
}) {
  const integrations = useIntegrations(open);
  const mutations = useIntegrationMutations();
  const connected = useMemo(
    () => (integrations.data?.providers ?? []).filter((p) => p.connected).map((p) => p.provider),
    [integrations.data],
  );
  const [provider, setProvider] = useState<IntegrationProvider | null>(initialProvider);
  const activeProvider = provider ?? initialProvider ?? connected[0] ?? null;

  useEffect(() => {
    if (open) setProvider(initialProvider);
  }, [open, initialProvider]);
  const [parentStack, setParentStack] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'Root' },
  ]);
  const parentId = parentStack[parentStack.length - 1]?.id ?? null;
  const filesQuery = useCloudFiles(open ? activeProvider : null, parentId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const files = filesQuery.data?.files ?? [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openFolder(id: string, name: string) {
    setParentStack((s) => [...s, { id, name }]);
    setSelected(new Set());
  }

  function goUp() {
    setParentStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setSelected(new Set());
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setSelected(new Set());
          setParentStack([{ id: null, name: 'Root' }]);
        }
        onOpenChange(v);
      }}
    >
      <ModalContent size="lg" className="max-h-[80vh] flex flex-col">
        <ModalHeader title="Import from cloud" align="start" />
        <ModalBody align="start">
          Browse a connected provider and import files into this library folder.
        </ModalBody>
        {!connected.length ? (
          <EmptyState
            title="No cloud providers connected"
            description="Connect Google Drive, Dropbox, OneDrive, or Box in Settings → Integrations."
          />
        ) : (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex flex-wrap gap-2">
              {connected.map((p) => (
                <Button
                  key={p}
                  size="xs"
                  variant={activeProvider === p ? 'primary' : 'neutral'}
                  mode={activeProvider === p ? 'filled' : 'stroke'}
                  onClick={() => {
                    setProvider(p);
                    setParentStack([{ id: null, name: 'Root' }]);
                    setSelected(new Set());
                  }}
                >
                  {PROVIDER_LABELS[p]}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-[13px] text-neutral-500">
              <Button
                size="xs"
                variant="neutral"
                mode="ghost"
                disabled={parentStack.length <= 1}
                onClick={goUp}
              >
                Up
              </Button>
              <span className="truncate">{parentStack.map((p) => p.name).join(' / ')}</span>
            </div>

            {filesQuery.isLoading ? (
              <LoadingState label="Loading files…" />
            ) : filesQuery.isError ? (
              <Alert
                status="error"
                variant="stroke"
                title="Could not list files"
                description={getErrorMessage(filesQuery.error)}
                compact
              />
            ) : files.length === 0 ? (
              <EmptyState title="Empty folder" description="No files here." />
            ) : (
              <ul className="flex-1 overflow-y-auto border border-neutral-200 rounded-16 divide-y divide-neutral-100 max-h-[360px]">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50"
                  >
                    {file.isFolder ? (
                      <button
                        type="button"
                        className="flex-1 text-left text-[14px] font-medium text-primary-base border-none bg-transparent cursor-pointer"
                        onClick={() => openFolder(file.id, file.name)}
                      >
                        📁 {file.name}
                      </button>
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          checked={selected.has(file.id)}
                          onChange={() => toggle(file.id)}
                          aria-label={`Select ${file.name}`}
                        />
                        <span className="flex-1 text-[14px] text-neutral-900 truncate">
                          {file.name}
                        </span>
                        {file.sizeBytes != null ? (
                          <span className="text-[12px] text-neutral-400">
                            {Math.round(file.sizeBytes / 1024)} KB
                          </span>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ModalFooter>
          <Button size="sm" variant="neutral" mode="stroke" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!activeProvider || selected.size === 0}
            loading={mutations.importFiles.isPending}
            onClick={() => {
              if (!activeProvider) return;
              void mutations.importFiles
                .mutateAsync({
                  provider: activeProvider,
                  fileIds: [...selected],
                  folderId,
                })
                .then((res) => {
                  const result = res as {
                    imported: number;
                    failed: Array<{ error: string }>;
                  };
                  if (result.imported) {
                    notify.success(
                      result.imported === 1
                        ? 'Import started'
                        : `${result.imported} imports started`,
                    );
                  }
                  if (result.failed?.length) {
                    notify.error(`${result.failed.length} file(s) failed to import`);
                  }
                  setSelected(new Set());
                  onOpenChange(false);
                })
                .catch((err) => notify.error(getErrorMessage(err)));
            }}
          >
            Import selected ({selected.size})
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
