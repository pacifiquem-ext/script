import React, { useEffect, useMemo, useState } from 'react';
import type { PublicDocumentVersion } from '@script/shared';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '../ui/Modal';
import { getErrorMessage } from '../../lib/form-errors';
import { apiRequest } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { diffLines, diffStats, type DiffLine } from '../../lib/text-diff';

type VersionDetail = {
  id: string;
  versionNumber: number;
  extractedText: string | null;
  changeReason: string;
  createdAt: string;
  createdByName?: string | null;
  isCurrent: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
  versions: PublicDocumentVersion[];
  /** Prefill selection when opening from a specific historical version */
  initialLeftId?: string | null;
  initialRightId?: string | null;
};

async function fetchVersionDetail(documentId: string, versionId: string): Promise<VersionDetail> {
  const data = await apiRequest<{ version: VersionDetail }>(
    `/documents/${documentId}/versions/${versionId}`,
  );
  return data.version;
}

function DiffPane({
  title,
  meta,
  lines,
  side,
}: {
  title: string;
  meta: string;
  lines: DiffLine[];
  side: 'left' | 'right';
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-12 border border-neutral-200 overflow-hidden">
      <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2">
        <p className="text-label-sm text-neutral-950">{title}</p>
        <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{meta}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[1.55]">
        {lines.length === 0 ? (
          <p className="p-3 text-neutral-400 text-para-sm font-sans">No text in this version.</p>
        ) : (
          lines.map((line, idx) => {
            const hide =
              (side === 'left' && line.op === 'add') || (side === 'right' && line.op === 'remove');
            const lineNo = side === 'left' ? line.leftLine : line.rightLine;
            const bg =
              line.op === 'equal'
                ? 'bg-white'
                : line.op === 'remove'
                  ? side === 'left'
                    ? 'bg-error-lighter/80'
                    : 'bg-neutral-50'
                  : side === 'right'
                    ? 'bg-success-lighter/80'
                    : 'bg-neutral-50';
            const marker =
              line.op === 'equal'
                ? ' '
                : line.op === 'remove'
                  ? side === 'left'
                    ? '−'
                    : ' '
                  : side === 'right'
                    ? '+'
                    : ' ';
            return (
              <div
                key={`${side}-${idx}`}
                className={cn(
                  'flex gap-2 border-b border-neutral-100/80 px-2 py-0.5',
                  bg,
                  hide && 'opacity-40',
                )}
              >
                <span className="w-8 shrink-0 select-none text-right text-neutral-400 tabular-nums">
                  {hide ? '' : (lineNo ?? '')}
                </span>
                <span
                  className={cn(
                    'w-3 shrink-0 select-none font-semibold',
                    line.op === 'add' && side === 'right' && 'text-success-base',
                    line.op === 'remove' && side === 'left' && 'text-error-base',
                    line.op === 'equal' && 'text-neutral-300',
                  )}
                >
                  {hide ? ' ' : marker}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-neutral-900">
                  {hide ? '\u00a0' : line.text || ' '}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function VersionDiffModal({
  open,
  onOpenChange,
  documentId,
  documentName,
  versions,
  initialLeftId,
  initialRightId,
}: Props) {
  const readyVersions = useMemo(
    () =>
      versions
        .filter((v) => v.status === 'ready')
        .sort((a, b) => a.versionNumber - b.versionNumber),
    [versions],
  );

  const defaultRight =
    readyVersions.find((v) => v.isCurrent)?.id ?? readyVersions[readyVersions.length - 1]?.id ?? '';
  const defaultLeft =
    readyVersions.filter((v) => v.id !== defaultRight).slice(-1)[0]?.id ??
    readyVersions[0]?.id ??
    '';

  const [leftId, setLeftId] = useState(initialLeftId || defaultLeft);
  const [rightId, setRightId] = useState(initialRightId || defaultRight);
  const [leftDetail, setLeftDetail] = useState<VersionDetail | null>(null);
  const [rightDetail, setRightDetail] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLeftId(initialLeftId || defaultLeft);
    setRightId(initialRightId || defaultRight);
  }, [open, initialLeftId, initialRightId, defaultLeft, defaultRight]);

  useEffect(() => {
    if (!open || !leftId || !rightId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      fetchVersionDetail(documentId, leftId),
      fetchVersionDetail(documentId, rightId),
    ])
      .then(([left, right]) => {
        if (cancelled) return;
        setLeftDetail(left);
        setRightDetail(right);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, 'Could not load versions to compare'));
        setLeftDetail(null);
        setRightDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, documentId, leftId, rightId]);

  const lines = useMemo(() => {
    if (!leftDetail || !rightDetail) return [];
    return diffLines(leftDetail.extractedText ?? '', rightDetail.extractedText ?? '');
  }, [leftDetail, rightDetail]);

  const stats = useMemo(() => diffStats(lines), [lines]);

  const labelFor = (id: string) => {
    const v = readyVersions.find((x) => x.id === id);
    if (!v) return id;
    return `v${v.versionNumber}${v.isCurrent ? ' (current)' : ''}`;
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-[960px]" size="lg" bodyClassName="!px-5 !pb-5 !pt-4 !gap-3">
        <ModalHeader title="Compare versions" align="start" />
        <ModalBody align="start" className="!mt-0 flex flex-col gap-3">
          <p className="m-0 text-para-sm text-neutral-500 leading-5">
            {documentName} — extracted text side by side. Green = added on the right; red = removed
            from the left.
          </p>
          {readyVersions.length < 2 ? (
            <EmptyState
              title="Need two ready versions"
              description="Process or upload another version before comparing."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[12px] text-neutral-600">
                  Left (older)
                  <select
                    className="h-9 min-w-[140px] rounded-10 border border-neutral-200 bg-white px-2 text-[13px] text-neutral-950"
                    value={leftId}
                    onChange={(e) => setLeftId(e.target.value)}
                    aria-label="Left version"
                  >
                    {readyVersions.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.id === rightId}>
                        {labelFor(v.id)} · {v.changeReason}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-neutral-600">
                  Right (newer)
                  <select
                    className="h-9 min-w-[140px] rounded-10 border border-neutral-200 bg-white px-2 text-[13px] text-neutral-950"
                    value={rightId}
                    onChange={(e) => setRightId(e.target.value)}
                    aria-label="Right version"
                  >
                    {readyVersions.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.id === leftId}>
                        {labelFor(v.id)} · {v.changeReason}
                      </option>
                    ))}
                  </select>
                </label>
                {!loading && leftDetail && rightDetail ? (
                  <p className="text-[12px] text-neutral-500 pb-2">
                    <span className="text-success-base font-medium">+{stats.added}</span>
                    {' · '}
                    <span className="text-error-base font-medium">−{stats.removed}</span>
                    {' · '}
                    <span className="text-neutral-500">{stats.equal} unchanged</span>
                  </p>
                ) : null}
              </div>

              {loading ? (
                <LoadingState label="Loading version text…" />
              ) : error ? (
                <ErrorState message={error} />
              ) : leftDetail && rightDetail ? (
                <div className="grid max-h-[min(52vh,480px)] grid-cols-1 gap-3 md:grid-cols-2">
                  <DiffPane
                    title={labelFor(leftId)}
                    meta={[
                      leftDetail.changeReason,
                      leftDetail.createdByName,
                      new Date(leftDetail.createdAt).toLocaleString(),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    lines={lines}
                    side="left"
                  />
                  <DiffPane
                    title={labelFor(rightId)}
                    meta={[
                      rightDetail.changeReason,
                      rightDetail.createdByName,
                      new Date(rightDetail.createdAt).toLocaleString(),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    lines={lines}
                    side="right"
                  />
                </div>
              ) : null}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="neutral"
            mode="stroke"
            className="w-fit"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
