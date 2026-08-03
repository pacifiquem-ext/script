import { randomUUID } from 'node:crypto';
import {
  paginate,
  toSkipTake,
  type CreateFolderBody,
  type ImportUrlBody,
  type ListDocumentsQuery,
  type UpdateDocumentBody,
  type UpdateFolderBody,
} from '@script/shared';
import { BadRequestError, NotFoundError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import { assertSafeUrl } from '../../lib/ssrf';
import { storage } from '../../storage';
import { assertHasCredits } from '../credits/credits-service';
import { assertLicenseAllowsWrite } from '../license/license-service';
import { enqueueIngestion } from '../jobs/queue';
import { INGESTION_CREDIT_COST } from '@script/shared';
import type { DocumentVersionChangeReason } from '@prisma/client';
import {
  createDocumentVersion,
  findDocumentByContentHash,
  findDocumentBySourceUrl,
  getDocumentVersion,
  hashDocumentBytes,
  listDocumentVersions,
  rollbackDocumentVersion,
  toPublicDocument,
  toPublicDocumentDetail,
  toPublicDocumentVersion,
  wouldChargeIngestion,
} from './document-versions';
import { toPublicFolder } from './serialize';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
]);

const documentVersionInclude = {
  currentVersion: { select: { id: true, versionNumber: true } },
  processingVersion: { select: { id: true, status: true } },
} as const;

export async function listFolders(workspaceId: string, parentId?: string | null) {
  const folders = await prisma.folder.findMany({
    where: { workspaceId, parentId: parentId === undefined ? undefined : parentId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { documents: true } } },
  });
  return { folders: folders.map((f) => toPublicFolder(f, f._count.documents)) };
}

export async function createFolder(workspaceId: string, body: CreateFolderBody) {
  if (body.parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: body.parentId, workspaceId } });
    if (!parent) throw new NotFoundError('Parent folder');
  }
  const folder = await prisma.folder.create({
    data: { workspaceId, name: body.name, parentId: body.parentId ?? null },
    include: { _count: { select: { documents: true } } },
  });
  return { folder: toPublicFolder(folder, folder._count.documents) };
}

export async function updateFolder(workspaceId: string, folderId: string, body: UpdateFolderBody) {
  const existing = await prisma.folder.findFirst({ where: { id: folderId, workspaceId } });
  if (!existing) throw new NotFoundError('Folder');
  if (body.parentId) {
    if (body.parentId === folderId) throw new BadRequestError('Folder cannot be its own parent');
    const parent = await prisma.folder.findFirst({ where: { id: body.parentId, workspaceId } });
    if (!parent) throw new NotFoundError('Parent folder');
  }
  const folder = await prisma.folder.update({
    where: { id: folderId },
    data: {
      name: body.name ?? undefined,
      parentId: body.parentId === undefined ? undefined : body.parentId,
    },
    include: { _count: { select: { documents: true } } },
  });
  return { folder: toPublicFolder(folder, folder._count.documents) };
}

export async function deleteFolder(workspaceId: string, folderId: string) {
  const existing = await prisma.folder.findFirst({
    where: { id: folderId, workspaceId },
    include: { _count: { select: { children: true, documents: true } } },
  });
  if (!existing) throw new NotFoundError('Folder');
  if (existing._count.children > 0 || existing._count.documents > 0) {
    throw new BadRequestError('Folder must be empty before deletion');
  }
  await prisma.folder.delete({ where: { id: folderId } });
  return { ok: true as const };
}

export async function listDocuments(
  workspaceId: string,
  query: ListDocumentsQuery,
  maxClearanceLevel = 0,
) {
  const where = {
    workspaceId,
    clearanceLevel: { lte: maxClearanceLevel },
    folderId: query.folderId === undefined ? undefined : query.folderId,
    status: query.status,
    name: query.q ? { contains: query.q, mode: 'insensitive' as const } : undefined,
  };
  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
      include: documentVersionInclude,
    }),
  ]);
  const data = await Promise.all(rows.map((row) => toPublicDocument(row)));
  return paginate(data, total, query);
}

export async function getDocument(
  workspaceId: string,
  documentId: string,
  options?: { versionId?: string | null; maxClearanceLevel?: number },
) {
  const maxClearance = options?.maxClearanceLevel ?? 0;
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId, clearanceLevel: { lte: maxClearance } },
    include: documentVersionInclude,
  });
  if (!doc) throw new NotFoundError('Document');

  if (options?.versionId) {
    const version = await prisma.documentVersion.findFirst({
      where: { id: options.versionId, documentId, workspaceId },
    });
    if (!version) throw new NotFoundError('Document version');
    return { document: await toPublicDocumentDetail(doc, { version }) };
  }

  return { document: await toPublicDocumentDetail(doc) };
}

export async function updateDocument(
  workspaceId: string,
  documentId: string,
  body: UpdateDocumentBody,
) {
  const existing = await prisma.document.findFirst({ where: { id: documentId, workspaceId } });
  if (!existing) throw new NotFoundError('Document');
  if (body.folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: body.folderId, workspaceId } });
    if (!folder) throw new NotFoundError('Folder');
  }
  const doc = await prisma.document.update({
    where: { id: documentId },
    data: {
      name: body.name ?? undefined,
      folderId: body.folderId === undefined ? undefined : body.folderId,
      clearanceLevel: body.clearanceLevel === undefined ? undefined : body.clearanceLevel,
    },
    include: documentVersionInclude,
  });
  return { document: await toPublicDocument(doc) };
}

export async function deleteDocument(workspaceId: string, documentId: string) {
  const existing = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    include: { versions: { select: { storageKey: true } } },
  });
  if (!existing) throw new NotFoundError('Document');
  const storageKeys = [...new Set(existing.versions.map((v) => v.storageKey).concat(existing.storageKey))];
  await prisma.document.delete({ where: { id: documentId } });
  for (const key of storageKeys) {
    try {
      await storage.delete(key);
    } catch {
      // best effort
    }
  }
  return { ok: true as const };
}

export async function reprocessDocument(workspaceId: string, documentId: string, userId: string) {
  const existing = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    include: documentVersionInclude,
  });
  if (!existing) throw new NotFoundError('Document');
  if (existing.processingVersionId) {
    throw new BadRequestError('Document is already processing');
  }

  const sourceVersion =
    (existing.currentVersionId
      ? await prisma.documentVersion.findUnique({ where: { id: existing.currentVersionId } })
      : null) ??
    (await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
    }));

  const contentHash = sourceVersion?.contentHash ?? existing.contentHash;
  const willCharge = await wouldChargeIngestion({
    workspaceId,
    documentId,
    contentHash,
  });
  if (willCharge) {
    await assertHasCredits(workspaceId, INGESTION_CREDIT_COST);
  }

  const version = await createDocumentVersion({
    documentId,
    workspaceId,
    mimeType: sourceVersion?.mimeType ?? existing.mimeType,
    byteSize: sourceVersion?.byteSize ?? existing.byteSize,
    storageKey: sourceVersion?.storageKey ?? existing.storageKey,
    contentHash,
    changeReason: 'reprocess',
    createdById: userId,
    status: 'pending',
  });

  const doc = await prisma.document.update({
    where: { id: documentId },
    data: {
      processingVersionId: version.id,
      // Keep last good version retrievable; only flip to pending when nothing is ready yet.
      status: existing.currentVersionId && existing.status === 'ready' ? 'ready' : 'pending',
      processingPhase: null,
      failureReason: null,
    },
    include: documentVersionInclude,
  });

  await enqueueIngestion(
    {
      documentId: doc.id,
      workspaceId,
      userId,
      versionId: version.id,
      mode: 'ingest',
    },
    { uniqueJobId: true },
  );
  return { document: await toPublicDocument(doc) };
}

/**
 * Attach revised bytes as a new version of an existing document.
 * Same content hash as current ready version → no-op (no charge, no new version).
 */
export async function uploadDocumentVersion(input: {
  workspaceId: string;
  userId: string;
  documentId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  /** Defaults to `upload`; cloud/URL re-import should pass `import`. */
  changeReason?: DocumentVersionChangeReason;
  /** When true and name is provided, update the document display name. */
  updateName?: boolean;
}) {
  const existing = await prisma.document.findFirst({
    where: { id: input.documentId, workspaceId: input.workspaceId },
    include: documentVersionInclude,
  });
  if (!existing) throw new NotFoundError('Document');
  if (existing.processingVersionId) {
    throw new BadRequestError('Document is already processing');
  }

  const mimeType = input.mimeType || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mimeType) && !mimeType.startsWith('text/')) {
    throw new BadRequestError(`Unsupported file type: ${mimeType}`);
  }

  const changeReason = input.changeReason ?? 'upload';
  const contentHash = hashDocumentBytes(input.buffer);
  if (
    existing.status === 'ready' &&
    existing.currentVersionId &&
    existing.contentHash &&
    existing.contentHash === contentHash
  ) {
    const current = await prisma.documentVersion.findUnique({
      where: { id: existing.currentVersionId },
    });
    return {
      document: await toPublicDocument(existing),
      version: current
        ? toPublicDocumentVersion(current, existing.currentVersionId, {
            id: current.createdById,
            name: null,
          })
        : null,
      deduplicated: true as const,
      versioned: false as const,
    };
  }

  const willCharge = await wouldChargeIngestion({
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    contentHash,
  });
  if (willCharge) {
    await assertHasCredits(input.workspaceId, INGESTION_CREDIT_COST);
  }

  const uploaded = await storage.upload({
    buffer: input.buffer,
    filename: input.filename || existing.name,
    contentType: mimeType,
  });

  const version = await createDocumentVersion({
    documentId: existing.id,
    workspaceId: input.workspaceId,
    mimeType,
    byteSize: uploaded.size,
    storageKey: uploaded.key,
    contentHash,
    changeReason,
    createdById: input.userId,
    status: 'pending',
  });

  const doc = await prisma.document.update({
    where: { id: existing.id },
    data: {
      processingVersionId: version.id,
      status: existing.currentVersionId && existing.status === 'ready' ? 'ready' : 'pending',
      processingPhase: null,
      failureReason: null,
      ...(input.updateName && input.filename ? { name: input.filename } : {}),
    },
    include: documentVersionInclude,
  });

  await enqueueIngestion(
    {
      documentId: doc.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      versionId: version.id,
      mode: 'ingest',
    },
    { uniqueJobId: true },
  );

  return {
    document: await toPublicDocument(doc),
    version: toPublicDocumentVersion(version, doc.currentVersionId, {
      id: input.userId,
      name: null,
    }),
    deduplicated: false as const,
    versioned: true as const,
  };
}

async function createPendingDocument(input: {
  workspaceId: string;
  userId: string;
  name: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  contentHash: string;
  source: 'local' | 'url' | 'drive' | 'dropbox' | 'onedrive' | 'box';
  sourceUrl?: string | null;
  folderId?: string | null;
}) {
  await assertHasCredits(input.workspaceId, INGESTION_CREDIT_COST);
  if (input.folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: input.folderId, workspaceId: input.workspaceId },
    });
    if (!folder) throw new NotFoundError('Folder');
  }

  const changeReason = input.source === 'local' ? 'upload' : 'import';

  const { doc, version } = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        workspaceId: input.workspaceId,
        folderId: input.folderId ?? null,
        name: input.name,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        storageKey: input.storageKey,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        status: 'pending',
        contentHash: input.contentHash,
        createdById: input.userId,
      },
    });
    const ver = await createDocumentVersion({
      documentId: created.id,
      workspaceId: input.workspaceId,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      storageKey: input.storageKey,
      contentHash: input.contentHash,
      changeReason,
      createdById: input.userId,
      status: 'pending',
      tx,
    });
    const updated = await tx.document.update({
      where: { id: created.id },
      data: { processingVersionId: ver.id },
      include: documentVersionInclude,
    });
    return { doc: updated, version: ver };
  });

  await enqueueIngestion({
    documentId: doc.id,
    workspaceId: input.workspaceId,
    userId: input.userId,
    versionId: version.id,
    mode: 'ingest',
  });
  return { document: await toPublicDocument(doc) };
}

export async function createDocumentFromBuffer(input: {
  workspaceId: string;
  userId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  folderId?: string | null;
  source: 'local' | 'url' | 'drive' | 'dropbox' | 'onedrive' | 'box';
  sourceUrl?: string | null;
}) {
  await assertLicenseAllowsWrite();
  const mimeType = input.mimeType || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mimeType) && !mimeType.startsWith('text/')) {
    throw new BadRequestError(`Unsupported file type: ${mimeType}`);
  }

  // Prefer source identity for cloud/URL re-import: same external file → new version on that Document.
  if (input.sourceUrl) {
    const bySource = await findDocumentBySourceUrl(input.workspaceId, input.sourceUrl);
    if (bySource) {
      if (bySource.processingVersionId) {
        throw new BadRequestError(
          'This file is already processing a new version. Wait for it to finish, then import again.',
        );
      }
      return uploadDocumentVersion({
        workspaceId: input.workspaceId,
        userId: input.userId,
        documentId: bySource.id,
        filename: input.filename,
        mimeType,
        buffer: input.buffer,
        changeReason: input.source === 'local' ? 'upload' : 'import',
        updateName: Boolean(input.filename && input.filename !== bySource.name),
      });
    }
  }

  const contentHash = hashDocumentBytes(input.buffer);
  const duplicate = await findDocumentByContentHash(input.workspaceId, contentHash);
  if (duplicate) {
    return {
      document: await toPublicDocument(duplicate),
      version: null,
      deduplicated: true as const,
      versioned: false as const,
    };
  }

  const uploaded = await storage.upload({
    buffer: input.buffer,
    filename: input.filename,
    contentType: mimeType,
  });
  const result = await createPendingDocument({
    workspaceId: input.workspaceId,
    userId: input.userId,
    name: input.filename,
    mimeType,
    byteSize: uploaded.size,
    storageKey: uploaded.key,
    contentHash,
    source: input.source,
    sourceUrl: input.sourceUrl,
    folderId: input.folderId,
  });
  return { ...result, deduplicated: false as const, versioned: false as const };
}

export async function uploadLocalDocument(input: {
  workspaceId: string;
  userId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  folderId?: string | null;
}) {
  return createDocumentFromBuffer({
    workspaceId: input.workspaceId,
    userId: input.userId,
    filename: input.filename,
    mimeType: input.mimeType,
    buffer: input.buffer,
    folderId: input.folderId,
    source: 'local',
  });
}

export async function importFromUrl(workspaceId: string, userId: string, body: ImportUrlBody) {
  const url = await assertSafeUrl(body.url);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new BadRequestError(`Failed to fetch URL (${response.status})`);
  const mimeType =
    response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) throw new BadRequestError('Remote file is empty');
  const filename =
    body.name || url.pathname.split('/').filter(Boolean).pop() || `import-${randomName()}.bin`;
  return createDocumentFromBuffer({
    workspaceId,
    userId,
    filename,
    mimeType,
    buffer,
    folderId: body.folderId,
    source: 'url',
    sourceUrl: body.url,
  });
}

function randomName() {
  return randomUUID().slice(0, 8);
}

export { listDocumentVersions, getDocumentVersion, rollbackDocumentVersion };
