import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiClientError } from '@script/shared';
import { ZodError, z } from 'zod';
import { apiRequest, getApiBaseUrl } from '../lib/api-client';
import { streamMessage } from '../lib/chat-api';
import { cn } from '../lib/cn';
import { getErrorMessage } from '../lib/form-errors';
import { buildDocumentPrompts, matchDocumentsInText } from '../lib/library-api';
import { queryKeys } from '../lib/query-client';
import { initials } from '../lib/workspaces';
import { COOKIE_WORKSPACE_ID, type PublicDocument } from '@script/shared';

function stubDoc(
  partial: Partial<PublicDocument> & Pick<PublicDocument, 'id' | 'name'>,
): PublicDocument {
  return {
    folderId: null,
    mimeType: 'text/plain',
    byteSize: 1,
    source: 'local',
    sourceUrl: null,
    status: 'ready',
    processingPhase: null,
    failureReason: null,
    pageCount: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    processedAt: null,
    currentVersionId: null,
    currentVersionNumber: null,
    isUpdating: false,
    ...partial,
  };
}

describe('cn', () => {
  it('joins truthy class parts', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});

describe('getErrorMessage', () => {
  it('extracts messages from known error types', () => {
    expect(getErrorMessage(new ApiClientError(400, 'X', 'client'))).toBe('client');
    try {
      z.string().parse(1);
    } catch (e) {
      expect(getErrorMessage(e)).toBeTruthy();
      expect(e).toBeInstanceOf(ZodError);
    }
    expect(getErrorMessage(new Error('plain'))).toBe('plain');
    expect(getErrorMessage('weird', 'fallback')).toBe('fallback');
  });
});

describe('queryKeys', () => {
  it('builds stable key tuples', () => {
    expect(queryKeys.session).toEqual(['session']);
    expect(queryKeys.documents('w', null)).toEqual(['documents', 'w', 'root']);
    expect(queryKeys.documents('w', 'f1')).toEqual(['documents', 'w', 'f1']);
    expect(queryKeys.messages('c1')).toEqual(['messages', 'c1']);
  });
});

describe('matchDocumentsInText', () => {
  it('matches full names and long basenames case-insensitively', () => {
    const docs = [
      stubDoc({ id: '1', name: 'AGENTS.md', folderId: 'f1' }),
      stubDoc({ id: '2', name: 'api.md' }),
      stubDoc({ id: '3', name: 'chunking.md' }),
    ];
    const hits = matchDocumentsInText('Tell me about agents.md in the folder', docs);
    expect(hits.map((d) => d.id)).toEqual(['1']);
    // short basename "api" should not match loosely
    expect(matchDocumentsInText('tell me about the api design', docs).map((d) => d.id)).toEqual([]);
    expect(matchDocumentsInText('summarize chunking', docs).map((d) => d.id)).toEqual(['3']);
  });
});

describe('buildDocumentPrompts', () => {
  it('builds prompts from newest ready files', () => {
    const docs = [
      stubDoc({
        id: '1',
        name: 'newer.md',
        status: 'ready',
        createdAt: '2026-07-09T12:00:00.000Z',
      }),
      stubDoc({
        id: '2',
        name: 'older.md',
        status: 'ready',
        createdAt: '2026-07-01T12:00:00.000Z',
      }),
      stubDoc({ id: '3', name: 'failed.md', status: 'failed' }),
    ];
    const prompts = buildDocumentPrompts(docs, 3);
    expect(prompts[0]).toContain('newer.md');
    expect(prompts.some((p) => p.includes('failed.md'))).toBe(false);
  });
});

describe('initials', () => {
  it('derives up to two initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('  single  ')).toBe('S');
    expect(initials('')).toBe('?');
  });
});

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = `${COOKIE_WORKSPACE_ID}=; Max-Age=0; path=/`;
  });

  it('sends json body and returns parsed payload', async () => {
    const data = await apiRequest<{ ok: boolean }>('/x', { method: 'POST', body: { a: 1 } });
    expect(data.ok).toBe(true);
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toContain('/x');
    expect(call[1].credentials).toBe('include');
    expect(call[1].body).toBe(JSON.stringify({ a: 1 }));
  });

  it('attaches workspace header from cookie', async () => {
    document.cookie = `${COOKIE_WORKSPACE_ID}=ws-1; path=/`;
    await apiRequest('/y');
    const headers = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1]
      .headers as Headers;
    expect(headers.get('x-workspace-id') || headers.get('X-Workspace-Id')).toBeTruthy();
  });

  it('parses structured API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'nope' } }),
      })),
    );
    await expect(apiRequest('/z')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'nope',
    });
  });

  it('falls back when error body is not json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => {
          throw new Error('no json');
        },
      })),
    );
    await expect(apiRequest('/z')).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
    });
  });

  it('returns undefined for 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 204,
        json: async () => ({}),
      })),
    );
    await expect(apiRequest('/empty', { parseJson: true })).resolves.toBeUndefined();
  });

  it('exposes base url string', () => {
    expect(typeof getApiBaseUrl()).toBe('string');
  });
});

describe('streamMessage errors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws API error message when stream fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        body: null,
        json: async () => ({ error: { message: 'no credits' } }),
      })),
    );
    await expect(streamMessage('c', 'hi', [], () => undefined)).rejects.toThrow('no credits');
  });

  it('throws on SSE error events', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'error', message: 'boom' })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        body,
      })),
    );
    await expect(streamMessage('c', 'hi', [], { onDelta: () => undefined })).rejects.toThrow(
      'boom',
    );
  });
});
