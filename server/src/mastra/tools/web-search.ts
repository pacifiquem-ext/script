import { createTool } from '@mastra/core/tools';
import { getTavilyClient } from '@mastra/tavily';
import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchFn = (query: string, maxResults: number) => Promise<WebSearchResult[]>;

async function tavilyViaMastra(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const key = env.TAVILY_API_KEY;
  if (!key) {
    throw new Error('Web search is not configured. Set TAVILY_API_KEY in server/.env.');
  }
  const client = getTavilyClient({ apiKey: key });
  const response = await client.search(query, {
    maxResults: Math.min(Math.max(maxResults, 1), 8),
    searchDepth: 'basic',
    includeAnswer: false,
  });
  const results = (
    response as { results?: Array<{ title?: string; url?: string; content?: string }> }
  ).results;
  return (results ?? []).map((r) => ({
    title: r.title ?? 'Untitled',
    url: r.url ?? '',
    snippet: (r.content ?? '').slice(0, 400),
  }));
}

let webSearchImpl: WebSearchFn = tavilyViaMastra;

export function setWebSearchForTests(fn: WebSearchFn | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setWebSearchForTests is only available in test');
  }
  webSearchImpl = fn ?? tavilyViaMastra;
}

export async function webSearch(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    return await webSearchImpl(q, maxResults);
  } catch (err) {
    logger.warn({ err, query: q }, 'web_search tool failed');
    throw err;
  }
}

/** Product tool id stays `web_search`; implementation uses @mastra/tavily client (ADR 0017). */
export const webSearchTool = createTool({
  id: 'web_search',
  description:
    'Search the public web for up-to-date external information. Not a substitute for Library or meeting content. Requires TAVILY_API_KEY when not in tests.',
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number().optional().describe('1–8 results, default 5'),
  }),
  execute: async (input) => {
    const query = input.query?.trim() ?? '';
    if (!query) return { error: 'query is required', results: [] as WebSearchResult[] };
    const maxResults = typeof input.maxResults === 'number' ? input.maxResults : 5;
    const results = await webSearch(query, maxResults);
    return { results };
  },
});
