import {
  ApiClientError,
  apiErrorBodySchema,
  COOKIE_WORKSPACE_ID,
  WORKSPACE_HEADER,
  type ApiErrorBody,
} from '@script/shared';

export { ApiClientError } from '@script/shared';

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  workspaceId?: string | null;
  parseJson?: boolean;
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

async function parseError(response: Response): Promise<ApiClientError> {
  try {
    const json: unknown = await response.json();
    const parsed = apiErrorBodySchema.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      return new ApiClientError(response.status, code, message, details);
    }
  } catch {
    // fall through
  }
  return new ApiClientError(response.status, 'HTTP_ERROR', response.statusText || 'Request failed');
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, workspaceId, parseJson = true, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders);

  if (body !== undefined && !(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const activeWorkspace = workspaceId === undefined ? readCookie(COOKIE_WORKSPACE_ID) : workspaceId;
  if (activeWorkspace) {
    headers.set(WORKSPACE_HEADER, activeWorkspace);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    credentials: 'include',
    headers,
    body:
      body instanceof FormData || body === undefined
        ? (body as FormData | undefined)
        : JSON.stringify(body),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (!parseJson || response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getApiBaseUrl(): string {
  return baseUrl;
}

export type { ApiErrorBody };
