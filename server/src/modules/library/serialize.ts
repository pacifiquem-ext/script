export {
  toPublicDocument,
  toPublicDocumentDetail,
  toPublicDocumentVersion,
  toPublicDocumentVersionDetail,
  type DocumentWithVersionMeta,
} from './document-versions';
import type { Folder } from '@prisma/client';
import type { PublicFolder } from '@script/shared';

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
