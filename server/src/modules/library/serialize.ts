import type { Document, Folder } from '@prisma/client';
import type { PublicDocument, PublicDocumentDetail, PublicFolder } from '@script/shared';
import { storage } from '../../storage';

export function toPublicFolder(folder: Folder, documentCount: number): PublicFolder {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    documentCount,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

export async function toPublicDocument(doc: Document, withUrl = false): Promise<PublicDocument> {
  let downloadUrl: string | null | undefined;
  if (withUrl) {
    try {
      downloadUrl = await storage.getSignedDownloadUrl(doc.storageKey);
    } catch {
      downloadUrl = null;
    }
  }
  return {
    id: doc.id,
    name: doc.name,
    folderId: doc.folderId,
    mimeType: doc.mimeType,
    byteSize: doc.byteSize,
    source: doc.source,
    sourceUrl: doc.sourceUrl,
    status: doc.status,
    processingPhase: (doc.processingPhase as PublicDocument['processingPhase']) ?? null,
    failureReason: doc.failureReason,
    pageCount: doc.pageCount,
    downloadUrl,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    processedAt: doc.processedAt?.toISOString() ?? null,
  };
}

export async function toPublicDocumentDetail(doc: Document): Promise<PublicDocumentDetail> {
  const base = await toPublicDocument(doc, true);
  return { ...base, extractedText: doc.extractedText };
}
