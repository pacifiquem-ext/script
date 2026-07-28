import { env } from '../../../config/env';
import { logger } from '../../../lib/logger';

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchFn = (query: string, maxResults: number) => Promise<WebSearchResult[]>;

async function tavilySearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const key = env.TAVILY_API_KEY;
  if (!key) {
    throw new Error(
      'Web search is not configured. Set TAVILY_API_KEY in server/.env (see ENV.md).',
    );
  }
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: Math.min(Math.max(maxResults, 1), 8),
      include_answer: false,
      search_depth: 'basic',
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Web search failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? 'Untitled',
    url: r.url ?? '',
    snippet: (r.content ?? '').slice(0, 400),
  }));
}

let webSearchImpl: WebSearchFn = tavilySearch;

export function setWebSearchForTests(fn: WebSearchFn | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setWebSearchForTests is only available in test');
  }
  webSearchImpl = fn ?? tavilySearch;
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
