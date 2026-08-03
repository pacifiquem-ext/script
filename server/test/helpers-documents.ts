import type { DocumentSource, DocumentStatus } from '@prisma/client';
import { prisma } from '../src/db/prisma';
import { setDocumentChunkEmbedding } from '../src/db/vector';
import { embedTexts } from '../src/modules/jobs/embeddings';

/** Create a document + v1 ready version + optional embedded chunk for tests. */
export async function createReadyDocumentWithVersion(input: {
  workspaceId: string;
  name: string;
  content: string;
  storageKey?: string;
  source?: DocumentSource;
  status?: DocumentStatus;
  withEmbedding?: boolean;
  createdById?: string;
}) {
  const storageKey = input.storageKey ?? `test-${input.name}`;
  const status = input.status ?? 'ready';
  const contentHash = `hash-${input.name}-${input.content.length}`;

  const doc = await prisma.document.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      mimeType: 'text/plain',
      byteSize: Buffer.byteLength(input.content),
      storageKey,
      source: input.source ?? 'local',
      status,
      extractedText: status === 'ready' ? input.content : null,
      summary:
        status === 'ready'
          ? input.content.replace(/\s+/g, ' ').trim().slice(0, 240)
          : null,
      embeddingModel: status === 'ready' ? 'voyage-3.5' : null,
      embeddingDimensions: status === 'ready' ? 1024 : null,
      contentHash: status === 'ready' ? contentHash : null,
      processedAt: status === 'ready' ? new Date() : null,
      createdById: input.createdById,
    },
  });

  const version = await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      workspaceId: input.workspaceId,
      versionNumber: 1,
      status,
      mimeType: 'text/plain',
      byteSize: Buffer.byteLength(input.content),
      storageKey,
      contentHash: status === 'ready' ? contentHash : null,
      extractedText: status === 'ready' ? input.content : null,
      summary:
        status === 'ready'
          ? input.content.replace(/\s+/g, ' ').trim().slice(0, 240)
          : null,
      embeddingModel: status === 'ready' ? 'voyage-3.5' : null,
      embeddingDimensions: status === 'ready' ? 1024 : null,
      changeReason: 'upload',
      processedAt: status === 'ready' ? new Date() : null,
      createdById: input.createdById,
    },
  });

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      currentVersionId: status === 'ready' ? version.id : null,
      processingVersionId: status === 'pending' || status === 'processing' ? version.id : null,
    },
  });

  let chunkId: string | null = null;
  if (status === 'ready' && input.withEmbedding !== false) {
    const chunk = await prisma.documentChunk.create({
      data: {
        documentId: doc.id,
        documentVersionId: version.id,
        workspaceId: input.workspaceId,
        position: 0,
        content: input.content,
        startOffset: 0,
        endOffset: input.content.length,
      },
    });
    chunkId = chunk.id;
    const [embedding] = await embedTexts([input.content]);
    await setDocumentChunkEmbedding(prisma, chunk.id, embedding);
  }

  return { document: doc, version, chunkId };
}
