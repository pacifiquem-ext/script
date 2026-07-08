import { env } from '../../../config/env';
import type { CloudProviderAdapter, DownloadedFile, ListFilesResult, OAuthTokens } from './types';

const AUTH = 'https://account.box.com/api/oauth2/authorize';
const TOKEN = 'https://api.box.com/oauth2/token';
const API = 'https://api.box.com/2.0';

export const boxAdapter: CloudProviderAdapter = {
  provider: 'box',
  displayName: 'Box',

  isConfigured() {
    return Boolean(env.BOX_CLIENT_ID && env.BOX_CLIENT_SECRET && env.OAUTH_REDIRECT_URL);
  },

  getAuthorizationUrl(state: string) {
    const params = new URLSearchParams({
      client_id: env.BOX_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: env.OAUTH_REDIRECT_URL!,
      state,
    });
    return `${AUTH}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.BOX_CLIENT_ID!,
      client_secret: env.BOX_CLIENT_SECRET!,
      redirect_uri: env.OAUTH_REDIRECT_URL!,
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Box token exchange failed: ${res.status}`);
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      restricted_to?: unknown;
    };
    const email = await this.getAccountEmail?.(json.access_token);
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      scopes: [],
      accountEmail: email ?? null,
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.BOX_CLIENT_ID!,
      client_secret: env.BOX_CLIENT_SECRET!,
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Box token refresh failed: ${res.status}`);
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      scopes: [],
    };
  },

  async getAccountEmail(accessToken: string) {
    const res = await fetch(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { login?: string };
    return json.login ?? null;
  },

  async listFiles(accessToken, parentId, cursor): Promise<ListFilesResult> {
    const folderId = parentId && parentId !== 'root' ? parentId : '0';
    const params = new URLSearchParams({
      limit: '50',
      fields: 'id,name,type,size,modified_at',
    });
    if (cursor) params.set('offset', cursor);
    const res = await fetch(`${API}/folders/${encodeURIComponent(folderId)}/items?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Box list failed: ${res.status}`);
    const json = (await res.json()) as {
      entries?: Array<{
        id: string;
        name: string;
        type: string;
        size?: number;
        modified_at?: string;
      }>;
      offset?: number;
      limit?: number;
      total_count?: number;
    };
    const offset = json.offset ?? 0;
    const limit = json.limit ?? 50;
    const total = json.total_count ?? 0;
    const nextOffset = offset + limit;
    return {
      nextCursor: nextOffset < total ? String(nextOffset) : null,
      files: (json.entries ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        path: null,
        isFolder: e.type === 'folder',
        mimeType: e.type === 'folder' ? 'inode/directory' : null,
        sizeBytes: typeof e.size === 'number' ? e.size : null,
        modifiedAt: e.modified_at ?? null,
      })),
    };
  },

  async downloadFile(accessToken, fileId, nameHint): Promise<DownloadedFile> {
    const metaRes = await fetch(`${API}/files/${encodeURIComponent(fileId)}?fields=id,name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) throw new Error(`Box metadata failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { name?: string };
    const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`Box download failed: ${res.status}`);
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      filename: meta.name || nameHint || fileId,
      mimeType: contentType.split(';')[0]!.trim(),
    };
  },
};
