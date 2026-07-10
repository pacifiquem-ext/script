import { describe, expect, it } from 'vitest';
import {
  ApiClientError,
  apiErrorBodySchema,
  backfillBodySchema,
  changePasswordBodySchema,
  createApiKeyBodySchema,
  createConversationBodySchema,
  createFolderBodySchema,
  createWorkspaceBodySchema,
  currentEmbeddingModel,
  deleteAccountBodySchema,
  documentStatusSchema,
  importUrlBodySchema,
  inviteMemberBodySchema,
  listConversationsQuerySchema,
  listDocumentsQuerySchema,
  loginBodySchema,
  messageCitationSchema,
  needsEmbeddingBackfill,
  paginate,
  paginationQuerySchema,
  publicDocumentSchema,
  publicUserSchema,
  resetPasswordBodySchema,
  sendMessageBodySchema,
  signUpBodySchema,
  toSkipTake,
  updatePreferencesBodySchema,
  userPreferencesSchema,
  verifyOtpBodySchema,
  workspaceRoleSchema,
  SIGNUP_CREDIT_GRANT,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  chatModelConfig,
} from '../src/index';

describe('pagination', () => {
  it('coerces and clamps query defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '5' })).toEqual({
      page: 2,
      pageSize: 5,
    });
    expect(() => paginationQuerySchema.parse({ pageSize: 999 })).toThrow();
  });

  it('computes skip/take and total pages', () => {
    expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
    expect(paginate(['a'], 0, { page: 1, pageSize: 10 }).pagination.totalPages).toBe(1);
    expect(paginate(['a'], 25, { page: 1, pageSize: 10 }).pagination.totalPages).toBe(3);
  });
});

describe('embeddings helpers', () => {
  it('exposes current model config', () => {
    expect(currentEmbeddingModel.model).toBe(EMBEDDING_MODEL);
    expect(currentEmbeddingModel.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it('detects backfill need only for ready docs with drift', () => {
    expect(
      needsEmbeddingBackfill({
        status: 'pending',
        embeddingModel: null,
        embeddingDimensions: null,
      }),
    ).toBe(false);
    expect(
      needsEmbeddingBackfill({
        status: 'ready',
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
      }),
    ).toBe(false);
    expect(
      needsEmbeddingBackfill({
        status: 'ready',
        embeddingModel: 'old-model',
        embeddingDimensions: EMBEDDING_DIMENSIONS,
      }),
    ).toBe(true);
    expect(
      needsEmbeddingBackfill({
        status: 'ready',
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: 512,
      }),
    ).toBe(true);
  });

  it('validates backfill body union', () => {
    expect(backfillBodySchema.parse({ documentId: 'd1' })).toEqual({ documentId: 'd1' });
    expect(backfillBodySchema.parse({ workspaceId: 'w1' })).toEqual({ workspaceId: 'w1' });
    expect(backfillBodySchema.parse({ all: true })).toEqual({ all: true });
    expect(() => backfillBodySchema.parse({})).toThrow();
  });
});

describe('auth schemas', () => {
  it('accepts valid signup/login/otp/reset payloads', () => {
    expect(
      signUpBodySchema.parse({ name: 'Ada', email: 'a@b.com', password: 'password1' }),
    ).toMatchObject({ name: 'Ada', email: 'a@b.com' });
    expect(loginBodySchema.parse({ email: 'a@b.com', password: 'x' }).email).toBe('a@b.com');
    expect(
      verifyOtpBodySchema.parse({ email: 'a@b.com', code: '123456', purpose: 'signup_verify' }),
    ).toMatchObject({ code: '123456' });
    expect(
      resetPasswordBodySchema.parse({
        email: 'a@b.com',
        code: '000000',
        password: 'newpass12',
      }).password,
    ).toBe('newpass12');
    expect(
      changePasswordBodySchema.parse({
        currentPassword: 'oldpass12',
        newPassword: 'newpass12',
      }),
    ).toBeTruthy();
  });

  it('rejects weak passwords and bad otp codes', () => {
    expect(() => signUpBodySchema.parse({ name: 'A', email: 'bad', password: 'short' })).toThrow();
    expect(() =>
      verifyOtpBodySchema.parse({ email: 'a@b.com', code: '12', purpose: 'login' }),
    ).toThrow();
  });

  it('parses public user shapes', () => {
    const now = new Date().toISOString();
    expect(
      publicUserSchema.parse({
        id: 'u1',
        email: 'a@b.com',
        name: 'Ada',
        avatarUrl: null,
        emailVerifiedAt: now,
        lastWorkspaceId: null,
        createdAt: now,
      }).id,
    ).toBe('u1');
  });
});

describe('library and chat schemas', () => {
  it('validates folder/document/import bodies', () => {
    expect(createFolderBodySchema.parse({ name: 'Docs' }).name).toBe('Docs');
    expect(importUrlBodySchema.parse({ url: 'https://example.com/a.pdf' }).url).toContain(
      'example.com',
    );
    expect(listDocumentsQuerySchema.parse({ page: 1, status: 'ready' }).status).toBe('ready');
    expect(documentStatusSchema.parse('failed')).toBe('failed');
    const ts = new Date().toISOString();
    expect(
      publicDocumentSchema.parse({
        id: 'd1',
        name: 'a.pdf',
        folderId: null,
        mimeType: 'application/pdf',
        byteSize: 10,
        source: 'local',
        sourceUrl: null,
        status: 'ready',
        processingPhase: null,
        failureReason: null,
        pageCount: 1,
        createdAt: ts,
        updatedAt: ts,
        processedAt: ts,
        currentVersionId: 'v1',
        currentVersionNumber: 1,
        isUpdating: false,
      }).name,
    ).toBe('a.pdf');
  });

  it('validates conversations and citations', () => {
    expect(createConversationBodySchema.parse({}).title).toBeUndefined();
    expect(sendMessageBodySchema.parse({ content: 'hi' }).documentIds).toEqual([]);
    expect(listConversationsQuerySchema.parse({ q: 'tax' }).q).toBe('tax');
    expect(
      messageCitationSchema.parse({
        documentId: 'd',
        documentName: 'n',
        documentVersionId: 'v1',
        chunkId: 'c',
        position: 0,
        score: 0.9,
      }).score,
    ).toBe(0.9);
    expect(chatModelConfig.model).toBeTruthy();
  });
});

describe('workspace and settings schemas', () => {
  it('validates workspace invite and preferences', () => {
    expect(createWorkspaceBodySchema.parse({ name: 'Team' }).name).toBe('Team');
    expect(inviteMemberBodySchema.parse({ email: 'x@y.com' }).role).toBe('member');
    expect(workspaceRoleSchema.parse('admin')).toBe('admin');
    expect(userPreferencesSchema.parse({}).theme).toBe('system');
    expect(updatePreferencesBodySchema.parse({ theme: 'dark' }).theme).toBe('dark');
    expect(deleteAccountBodySchema.parse({ email: 'a@b.com', password: 'x' }).email).toBe(
      'a@b.com',
    );
    expect(createApiKeyBodySchema.parse({ name: 'CI' }).name).toBe('CI');
    expect(SIGNUP_CREDIT_GRANT).toBeGreaterThan(0);
  });
});

describe('api error types', () => {
  it('parses error envelopes and constructs client errors', () => {
    expect(
      apiErrorBodySchema.parse({
        error: { code: 'BAD_REQUEST', message: 'Nope', details: { field: 'email' } },
      }).error.code,
    ).toBe('BAD_REQUEST');
    const err = new ApiClientError(403, 'FORBIDDEN', 'nope', { a: 1 });
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.details).toEqual({ a: 1 });
    expect(err.name).toBe('ApiClientError');
  });
});
