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
import { enqueueIngestion } from '../jobs/queue';
import { INGESTION_CREDIT_COST } from '@script/shared';
import { toPublicDocument, toPublicDocumentDetail, toPublicFolder } from './serialize';

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

export async function listDocuments(workspaceId: string, query: ListDocumentsQuery) {
  const where = {
    workspaceId,
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
    }),
  ]);
  const data = await Promise.all(rows.map((row) => toPublicDocument(row)));
  return paginate(data, total, query);
}

export async function getDocument(workspaceId: string, documentId: string) {
  const doc = await prisma.document.findFirst({ where: { id: documentId, workspaceId } });
  if (!doc) throw new NotFoundError('Document');
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
    },
  });
  return { document: await toPublicDocument(doc) };
}

export async function deleteDocument(workspaceId: string, documentId: string) {
  const existing = await prisma.document.findFirst({ where: { id: documentId, workspaceId } });
  if (!existing) throw new NotFoundError('Document');
  await prisma.document.delete({ where: { id: documentId } });
  try {
    await storage.delete(existing.storageKey);
  } catch {
    // best effort
  }
  return { ok: true as const };
}

async function createPendingDocument(input: {
  workspaceId: string;
  userId: string;
  name: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
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
  const doc = await prisma.document.create({
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
      createdById: input.userId,
    },
  });
  await enqueueIngestion({
    documentId: doc.id,
    workspaceId: input.workspaceId,
    userId: input.userId,
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
  const mimeType = input.mimeType || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mimeType) && !mimeType.startsWith('text/')) {
    throw new BadRequestError(`Unsupported file type: ${mimeType}`);
  }
  const uploaded = await storage.upload({
    buffer: input.buffer,
    filename: input.filename,
    contentType: mimeType,
  });
  return createPendingDocument({
    workspaceId: input.workspaceId,
    userId: input.userId,
    name: input.filename,
    mimeType,
    byteSize: uploaded.size,
    storageKey: uploaded.key,
    source: input.source,
    sourceUrl: input.sourceUrl,
    folderId: input.folderId,
  });
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
  const uploaded = await storage.upload({ buffer, filename, contentType: mimeType });
  return createPendingDocument({
    workspaceId,
    userId,
    name: filename,
    mimeType,
    byteSize: uploaded.size,
    storageKey: uploaded.key,
    source: 'url',
    sourceUrl: body.url,
    folderId: body.folderId,
  });
}

function randomName() {
  return randomUUID().slice(0, 8);
}
