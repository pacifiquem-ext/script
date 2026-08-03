import type { FastifyInstance } from 'fastify';
import {
  createFolderBodySchema,
  importUrlBodySchema,
  listDocumentsQuerySchema,
  updateDocumentBodySchema,
  updateFolderBodySchema,
} from '@script/shared';
import { BadRequestError } from '../../common/errors';
import { requireWorkspace } from '../../plugins/auth';
import * as library from './library-service';

export async function libraryRoutes(app: FastifyInstance) {
  app.get('/folders', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const parentId = (request.query as { parentId?: string }).parentId ?? null;
    return library.listFolders(workspace.id, parentId);
  });

  app.post('/folders', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return library.createFolder(workspace.id, createFolderBodySchema.parse(request.body));
  });

  app.patch('/folders/:folderId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { folderId } = request.params as { folderId: string };
    return library.updateFolder(workspace.id, folderId, updateFolderBodySchema.parse(request.body));
  });

  app.delete('/folders/:folderId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { folderId } = request.params as { folderId: string };
    return library.deleteFolder(workspace.id, folderId);
  });

  app.get('/documents', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const query = listDocumentsQuerySchema.parse(request.query);
    return library.listDocuments(workspace.id, query, workspace.clearanceLevel);
  });

  app.get('/documents/:documentId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { documentId } = request.params as { documentId: string };
    const versionId = (request.query as { versionId?: string }).versionId;
    return library.getDocument(workspace.id, documentId, {
      versionId,
      maxClearanceLevel: workspace.clearanceLevel,
    });
  });

  app.get('/documents/:documentId/versions', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { documentId } = request.params as { documentId: string };
    return library.listDocumentVersions(workspace.id, documentId);
  });

  app.get('/documents/:documentId/versions/:versionId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { documentId, versionId } = request.params as {
      documentId: string;
      versionId: string;
    };
    return library.getDocumentVersion(workspace.id, documentId, versionId);
  });

  app.post('/documents/:documentId/versions/:versionId/rollback', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { documentId, versionId } = request.params as {
      documentId: string;
      versionId: string;
    };
    return library.rollbackDocumentVersion(workspace.id, documentId, versionId, user.id);
  });

  app.post('/documents/:documentId/versions', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { documentId } = request.params as { documentId: string };
    const file = await request.file();
    if (!file) throw new BadRequestError('file is required');
    const buffer = await file.toBuffer();
    return library.uploadDocumentVersion({
      workspaceId: workspace.id,
      userId: user.id,
      documentId,
      filename: file.filename,
      mimeType: file.mimetype,
      buffer,
    });
  });

  app.patch('/documents/:documentId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { documentId } = request.params as { documentId: string };
    return library.updateDocument(
      workspace.id,
      documentId,
      updateDocumentBodySchema.parse(request.body),
    );
  });

  app.delete('/documents/:documentId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { documentId } = request.params as { documentId: string };
    return library.deleteDocument(workspace.id, documentId);
  });

  app.post('/documents/:documentId/reprocess', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { documentId } = request.params as { documentId: string };
    return library.reprocessDocument(workspace.id, documentId, user.id);
  });

  app.post('/documents/upload', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const file = await request.file();
    if (!file) throw new BadRequestError('file is required');
    const buffer = await file.toBuffer();
    const folderId =
      (file.fields.folderId && 'value' in file.fields.folderId
        ? String((file.fields.folderId as { value: string }).value)
        : null) || null;
    return library.uploadLocalDocument({
      workspaceId: workspace.id,
      userId: user.id,
      filename: file.filename,
      mimeType: file.mimetype,
      buffer,
      folderId,
    });
  });

  app.post('/documents/import-url', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    return library.importFromUrl(workspace.id, user.id, importUrlBodySchema.parse(request.body));
  });
}
