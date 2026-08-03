import { createHash } from 'node:crypto';
import type { Document, DocumentVersion, DocumentVersionChangeReason, Prisma } from '@prisma/client';
import type {
  PublicDocument,
  PublicDocumentDetail,
  PublicDocumentVersion,
  PublicDocumentVersionDetail,
} from '@script/shared';
import { BadRequestError, NotFoundError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import { storage } from '../../storage';

export function hashDocumentBytes(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export type DocumentWithVersionMeta = Document & {
  currentVersion?: Pick<DocumentVersion, 'id' | 'versionNumber'> | null;
  processingVersion?: Pick<DocumentVersion, 'id' | 'status'> | null;
};

export function isDocumentUpdating(doc: {
  processingVersionId: string | null;
  status: string;
  processingVersion?: { status: string } | null;
}): boolean {
  if (!doc.processingVersionId) return false;
  const processingStatus = doc.processingVersion?.status;
  if (processingStatus) {
    return processingStatus === 'pending' || processingStatus === 'processing';
  }
  return true;
}

export async function toPublicDocument(
  doc: DocumentWithVersionMeta,
  withUrl = false,
): Promise<PublicDocument> {
  let downloadUrl: string | null | undefined;
  if (withUrl) {
    try {
      downloadUrl = await storage.getSignedDownloadUrl(doc.storageKey);
    } catch {
      downloadUrl = null;
    }
  }
  const isUpdating = isDocumentUpdating(doc);
  return {
    id: doc.id,
    name: doc.name,
    folderId: doc.folderId,
    mimeType: doc.mimeType,
    byteSize: doc.byteSize,
    source: doc.source,
    sourceUrl: doc.sourceUrl,
    clearanceLevel: doc.clearanceLevel ?? 0,
    status: doc.status,
    processingPhase: (doc.processingPhase as PublicDocument['processingPhase']) ?? null,
    failureReason: doc.failureReason,
    pageCount: doc.pageCount,
    summary: doc.summary ?? null,
    downloadUrl,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    processedAt: doc.processedAt?.toISOString() ?? null,
    currentVersionId: doc.currentVersionId,
    currentVersionNumber: doc.currentVersion?.versionNumber ?? null,
    isUpdating,
  };
}

export async function toPublicDocumentDetail(
  doc: DocumentWithVersionMeta,
  options?: { version?: DocumentVersion },
): Promise<PublicDocumentDetail> {
  const version = options?.version;
  const base = await toPublicDocument(
    version
      ? {
          ...doc,
          mimeType: version.mimeType,
          byteSize: version.byteSize,
          storageKey: version.storageKey,
          pageCount: version.pageCount,
          extractedText: version.extractedText,
          status: version.status,
          processingPhase: version.processingPhase,
          failureReason: version.failureReason,
          processedAt: version.processedAt,
        }
      : doc,
    true,
  );
  return {
    ...base,
    extractedText: version?.extractedText ?? doc.extractedText,
    versionId: version?.id ?? doc.currentVersionId,
    versionNumber: version?.versionNumber ?? doc.currentVersion?.versionNumber ?? null,
  };
}

export function toPublicDocumentVersion(
  version: DocumentVersion,
  currentVersionId: string | null,
  actor?: { id: string | null; name: string | null } | null,
): PublicDocumentVersion {
  return {
    id: version.id,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    status: version.status,
    processingPhase: (version.processingPhase as PublicDocumentVersion['processingPhase']) ?? null,
    failureReason: version.failureReason,
    mimeType: version.mimeType,
    byteSize: version.byteSize,
    contentHash: version.contentHash,
    pageCount: version.pageCount,
    changeReason: version.changeReason,
    restoredFromVersionId: version.restoredFromVersionId,
    isCurrent: currentVersionId === version.id,
    createdById: actor?.id ?? version.createdById ?? null,
    createdByName: actor?.name ?? null,
    createdAt: version.createdAt.toISOString(),
    processedAt: version.processedAt?.toISOString() ?? null,
    supersededAt: version.supersededAt?.toISOString() ?? null,
  };
}

async function resolveVersionActors(
  versions: Array<{ createdById: string | null }>,
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(versions.map((v) => v.createdById).filter((id): id is string => Boolean(id))),
  ];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function toPublicDocumentVersionDetail(
  version: DocumentVersion,
  currentVersionId: string | null,
): Promise<PublicDocumentVersionDetail> {
  let downloadUrl: string | null | undefined;
  try {
    downloadUrl = await storage.getSignedDownloadUrl(version.storageKey);
  } catch {
    downloadUrl = null;
  }
  const names = await resolveVersionActors([version]);
  const createdById = version.createdById ?? null;
  return {
    ...toPublicDocumentVersion(version, currentVersionId, {
      id: createdById,
      name: createdById ? (names.get(createdById) ?? null) : null,
    }),
    extractedText: version.extractedText,
    downloadUrl,
  };
}

export async function findDocumentByContentHash(workspaceId: string, contentHash: string) {
  return prisma.document.findFirst({
    where: {
      workspaceId,
      contentHash,
      status: 'ready',
      currentVersionId: { not: null },
    },
    include: {
      currentVersion: { select: { id: true, versionNumber: true } },
      processingVersion: { select: { id: true, status: true } },
    },
  });
}

/** Match library identity for cloud/URL re-import (`provider://fileId` or absolute URL). */
export async function findDocumentBySourceUrl(workspaceId: string, sourceUrl: string) {
  if (!sourceUrl) return null;
  return prisma.document.findFirst({
    where: { workspaceId, sourceUrl },
    include: {
      currentVersion: { select: { id: true, versionNumber: true } },
      processingVersion: { select: { id: true, status: true } },
    },
  });
}

export async function nextVersionNumber(documentId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? prisma;
  const latest = await db.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

export async function createDocumentVersion(input: {
  documentId: string;
  workspaceId: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  contentHash?: string | null;
  changeReason: DocumentVersionChangeReason;
  createdById?: string | null;
  restoredFromVersionId?: string | null;
  extractedText?: string | null;
  pageCount?: number | null;
  status?: 'pending' | 'processing' | 'ready' | 'failed';
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const versionNumber = await nextVersionNumber(input.documentId, db);
  return db.documentVersion.create({
    data: {
      documentId: input.documentId,
      workspaceId: input.workspaceId,
      versionNumber,
      status: input.status ?? 'pending',
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      storageKey: input.storageKey,
      contentHash: input.contentHash ?? null,
      changeReason: input.changeReason,
      createdById: input.createdById ?? null,
      restoredFromVersionId: input.restoredFromVersionId ?? null,
      extractedText: input.extractedText ?? null,
      pageCount: input.pageCount ?? null,
    },
  });
}

/** Project version fields onto the document row used by list/detail/retrieval UI. */
export async function projectDocumentFromVersion(
  documentId: string,
  version: DocumentVersion,
  options: {
    makeCurrent: boolean;
    clearProcessing: boolean;
    failureReason?: string | null;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? prisma;
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });

  if (options.makeCurrent && doc.currentVersionId && doc.currentVersionId !== version.id) {
    await db.documentVersion.update({
      where: { id: doc.currentVersionId },
      data: { supersededAt: new Date() },
    });
  }

  const keepReadyWhileUpdating =
    !options.makeCurrent &&
    doc.currentVersionId != null &&
    doc.status === 'ready' &&
    (version.status === 'pending' || version.status === 'processing' || version.status === 'failed');

  return db.document.update({
    where: { id: documentId },
    data: {
      mimeType: options.makeCurrent ? version.mimeType : undefined,
      byteSize: options.makeCurrent ? version.byteSize : undefined,
      storageKey: options.makeCurrent ? version.storageKey : undefined,
      pageCount: options.makeCurrent ? version.pageCount : undefined,
      extractedText: options.makeCurrent ? version.extractedText : undefined,
      summary: options.makeCurrent ? version.summary : undefined,
      embeddingModel: options.makeCurrent ? version.embeddingModel : undefined,
      embeddingDimensions: options.makeCurrent ? version.embeddingDimensions : undefined,
      contentHash: options.makeCurrent ? version.contentHash : undefined,
      processedAt: options.makeCurrent ? version.processedAt : undefined,
      status: keepReadyWhileUpdating
        ? 'ready'
        : options.makeCurrent
          ? version.status
          : version.status === 'failed' && doc.currentVersionId
            ? 'ready'
            : version.status,
      processingPhase: options.makeCurrent || options.clearProcessing ? null : version.processingPhase,
      failureReason:
        options.failureReason !== undefined
          ? options.failureReason
          : options.makeCurrent
            ? null
            : version.status === 'failed' && doc.currentVersionId
              ? version.failureReason
              : version.failureReason,
      currentVersionId: options.makeCurrent ? version.id : undefined,
      processingVersionId: options.clearProcessing
        ? null
        : version.status === 'pending' || version.status === 'processing'
          ? version.id
          : null,
    },
    include: {
      currentVersion: { select: { id: true, versionNumber: true } },
      processingVersion: { select: { id: true, status: true } },
    },
  });
}

export async function listDocumentVersions(workspaceId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { id: true, currentVersionId: true },
  });
  if (!doc) throw new NotFoundError('Document');
  const versions = await prisma.documentVersion.findMany({
    where: { documentId, workspaceId },
    orderBy: { versionNumber: 'desc' },
  });
  const names = await resolveVersionActors(versions);
  return {
    versions: versions.map((v) =>
      toPublicDocumentVersion(v, doc.currentVersionId, {
        id: v.createdById,
        name: v.createdById ? (names.get(v.createdById) ?? null) : null,
      }),
    ),
  };
}

export async function getDocumentVersion(
  workspaceId: string,
  documentId: string,
  versionId: string,
) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { id: true, currentVersionId: true },
  });
  if (!doc) throw new NotFoundError('Document');
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId, workspaceId },
  });
  if (!version) throw new NotFoundError('Document version');
  return {
    version: await toPublicDocumentVersionDetail(version, doc.currentVersionId),
  };
}

export async function cloneChunksToVersion(input: {
  sourceVersionId: string;
  targetVersionId: string;
  documentId: string;
  workspaceId: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const sourceChunks = await db.documentChunk.findMany({
    where: { documentVersionId: input.sourceVersionId },
    orderBy: { position: 'asc' },
    select: {
      position: true,
      content: true,
      startOffset: true,
      endOffset: true,
      pageNumber: true,
    },
  });
  if (sourceChunks.length === 0) return 0;

  await db.documentChunk.createMany({
    data: sourceChunks.map((chunk) => ({
      documentId: input.documentId,
      documentVersionId: input.targetVersionId,
      workspaceId: input.workspaceId,
      position: chunk.position,
      content: chunk.content,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      pageNumber: chunk.pageNumber,
    })),
  });

  // Single join update — avoid N raw queries (interactive txn timeout on large docs).
  await db.$executeRaw`
    UPDATE "DocumentChunk" AS target
    SET embedding = source.embedding
    FROM "DocumentChunk" AS source
    WHERE target."documentVersionId" = ${input.targetVersionId}
      AND source."documentVersionId" = ${input.sourceVersionId}
      AND target.position = source.position
  `;

  return sourceChunks.length;
}

/**
 * Roll back by creating a new ready version that copies content + chunks from a prior ready version.
 * History is append-only — the restored version becomes current; old versions remain for citations.
 */
export async function rollbackDocumentVersion(
  workspaceId: string,
  documentId: string,
  versionId: string,
  userId: string,
) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
  });
  if (!doc) throw new NotFoundError('Document');
  if (doc.processingVersionId) {
    throw new BadRequestError('Cannot roll back while a version is still processing');
  }

  const source = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId, workspaceId },
  });
  if (!source) throw new NotFoundError('Document version');
  if (source.status !== 'ready') {
    throw new BadRequestError('Only ready versions can be restored');
  }
  if (doc.currentVersionId === source.id) {
    throw new BadRequestError('Version is already current');
  }

  const chunkCount = await prisma.documentChunk.count({
    where: { documentVersionId: source.id },
  });
  if (chunkCount === 0) {
    throw new BadRequestError('Source version has no chunks to restore');
  }

  const newVersion = await prisma.$transaction(
    async (tx) => {
      const version = await createDocumentVersion({
        documentId,
        workspaceId,
        mimeType: source.mimeType,
        byteSize: source.byteSize,
        storageKey: source.storageKey,
        contentHash: source.contentHash,
        changeReason: 'rollback',
        createdById: userId,
        restoredFromVersionId: source.id,
        extractedText: source.extractedText,
        pageCount: source.pageCount,
        status: 'ready',
        tx,
      });

      await tx.documentVersion.update({
        where: { id: version.id },
        data: {
          status: 'ready',
          embeddingModel: source.embeddingModel,
          embeddingDimensions: source.embeddingDimensions,
          processedAt: new Date(),
          processingPhase: null,
          failureReason: null,
        },
      });

      await cloneChunksToVersion({
        sourceVersionId: source.id,
        targetVersionId: version.id,
        documentId,
        workspaceId,
        tx,
      });

      const ready = await tx.documentVersion.findUniqueOrThrow({ where: { id: version.id } });
      await projectDocumentFromVersion(
        documentId,
        ready,
        { makeCurrent: true, clearProcessing: true, failureReason: null },
        tx,
      );
      return ready;
    },
    { timeout: 30_000 },
  );

  const updated = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: {
      currentVersion: { select: { id: true, versionNumber: true } },
      processingVersion: { select: { id: true, status: true } },
    },
  });

  const names = await resolveVersionActors([newVersion]);
  return {
    document: await toPublicDocument(updated),
    version: toPublicDocumentVersion(newVersion, updated.currentVersionId, {
      id: newVersion.createdById,
      name: newVersion.createdById ? (names.get(newVersion.createdById) ?? null) : null,
    }),
  };
}

/** True when ingestion of this content would debit credits (no prior ready version with same hash). */
export async function wouldChargeIngestion(input: {
  workspaceId: string;
  documentId: string;
  contentHash: string | null | undefined;
  excludeVersionId?: string;
}): Promise<boolean> {
  if (!input.contentHash) return true;

  const priorReadySameHash = await prisma.documentVersion.findFirst({
    where: {
      documentId: input.documentId,
      workspaceId: input.workspaceId,
      contentHash: input.contentHash,
      status: 'ready',
      ...(input.excludeVersionId ? { id: { not: input.excludeVersionId } } : {}),
    },
    select: { id: true },
  });
  return !priorReadySameHash;
}

export async function shouldChargeIngestion(input: {
  workspaceId: string;
  documentId: string;
  versionId: string;
  contentHash: string | null | undefined;
}): Promise<boolean> {
  return wouldChargeIngestion({
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    contentHash: input.contentHash,
    excludeVersionId: input.versionId,
  });
}

/** Last N versions as short audit lines for chat (metadata only — never body text). */
export async function formatDocumentVersionChangelog(
  workspaceId: string,
  documentIds: string[],
  limitPerDoc = 5,
): Promise<string> {
  if (documentIds.length === 0) return '';
  const versions = await prisma.documentVersion.findMany({
    where: { workspaceId, documentId: { in: documentIds } },
    orderBy: [{ documentId: 'asc' }, { versionNumber: 'desc' }],
    select: {
      documentId: true,
      versionNumber: true,
      changeReason: true,
      createdById: true,
      createdAt: true,
      status: true,
    },
  });
  if (versions.length === 0) return '';

  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds }, workspaceId },
    select: { id: true, name: true, currentVersionId: true },
  });
  const docById = new Map(docs.map((d) => [d.id, d]));
  const currentNumbers = new Map<string, number>();
  const currentIds = docs.map((d) => d.currentVersionId).filter((id): id is string => Boolean(id));
  if (currentIds.length) {
    const currents = await prisma.documentVersion.findMany({
      where: { id: { in: currentIds } },
      select: { id: true, documentId: true, versionNumber: true },
    });
    for (const c of currents) currentNumbers.set(c.documentId, c.versionNumber);
  }

  const names = await resolveVersionActors(versions);
  const byDoc = new Map<string, typeof versions>();
  for (const v of versions) {
    const list = byDoc.get(v.documentId) ?? [];
    if (list.length < limitPerDoc) list.push(v);
    byDoc.set(v.documentId, list);
  }

  const blocks: string[] = [];
  for (const documentId of documentIds) {
    const doc = docById.get(documentId);
    const list = byDoc.get(documentId);
    if (!doc || !list?.length) continue;
    const currentN = currentNumbers.get(documentId);
    const lines = list.map((v) => {
      const who = v.createdById ? names.get(v.createdById) ?? 'someone' : 'system';
      const when = v.createdAt.toISOString().slice(0, 10);
      const current = currentN === v.versionNumber ? ' current' : '';
      return `v${v.versionNumber}${current} (${v.changeReason} by ${who}, ${when}, ${v.status})`;
    });
    blocks.push(`${doc.name}: ${lines.join('; ')}`);
  }
  return blocks.length ? `Document version history (metadata only, not content):\n${blocks.join('\n')}` : '';
}
