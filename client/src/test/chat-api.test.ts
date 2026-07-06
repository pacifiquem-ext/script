import { describe, expect, it, vi } from 'vitest';
import { streamMessage } from '../lib/chat-api';

function sseBody(events: unknown[]) {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
}

describe('streamMessage', () => {
  it('parses delta, citations, done and errors', async () => {
    const deltas: string[] = [];
    const citations: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        body: sseBody([
          {
            type: 'citations',
            citations: [{ documentId: 'd1', documentName: 'A', chunkId: 'c1', position: 0 }],
          },
          { type: 'delta', text: 'Hi' },
          { type: 'delta', text: ' there' },
          {
            type: 'done',
            message: {
              id: 'm1',
              role: 'assistant',
              content: 'Hi there',
              documentIds: [],
              citations: [],
              partial: false,
              createdAt: new Date().toISOString(),
            },
          },
        ]),
      })),
    );
    const done = await streamMessage('conv', 'q', [], {
      onDelta: (t) => deltas.push(t),
      onCitations: (c) => citations.push(...c),
    });
    expect(deltas.join('')).toBe('Hi there');
    expect(citations).toHaveLength(1);
    expect(done?.content).toBe('Hi there');
  });
});
