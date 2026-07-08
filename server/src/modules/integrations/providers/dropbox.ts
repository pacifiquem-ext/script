import { env } from '../../../config/env';
import type { CloudProviderAdapter, DownloadedFile, ListFilesResult, OAuthTokens } from './types';

const AUTH = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const LIST = 'https://api.dropboxapi.com/2/files/list_folder';
const LIST_CONT = 'https://api.dropboxapi.com/2/files/list_folder/continue';
const DOWNLOAD = 'https://content.dropboxapi.com/2/files/download';
const ACCOUNT = 'https://api.dropboxapi.com/2/users/get_current_account';

export const dropboxAdapter: CloudProviderAdapter = {
  provider: 'dropbox',
  displayName: 'Dropbox',

  isConfigured() {
    return Boolean(env.DROPBOX_CLIENT_ID && env.DROPBOX_CLIENT_SECRET && env.OAUTH_REDIRECT_URL);
  },

  getAuthorizationUrl(state: string) {
    const params = new URLSearchParams({
      client_id: env.DROPBOX_CLIENT_ID!,
      redirect_uri: env.OAUTH_REDIRECT_URL!,
      response_type: 'code',
      token_access_type: 'offline',
      state,
    });
    return `${AUTH}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: env.DROPBOX_CLIENT_ID!,
      client_secret: env.DROPBOX_CLIENT_SECRET!,
      redirect_uri: env.OAUTH_REDIRECT_URL!,
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Dropbox token exchange failed: ${res.status}`);
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const email = await this.getAccountEmail?.(json.access_token);
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      scopes: json.scope?.split(' ').filter(Boolean) ?? [],
      accountEmail: email ?? null,
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.DROPBOX_CLIENT_ID!,
      client_secret: env.DROPBOX_CLIENT_SECRET!,
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Dropbox token refresh failed: ${res.status}`);
    const json = (await res.json()) as {
      access_token: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: json.access_token,
      refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      scopes: json.scope?.split(' ').filter(Boolean) ?? [],
    };
  },

  async getAccountEmail(accessToken: string) {
    const res = await fetch(ACCOUNT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email ?? null;
  },

  async listFiles(accessToken, parentId, cursor): Promise<ListFilesResult> {
    const res = await fetch(cursor ? LIST_CONT : LIST, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        cursor
          ? { cursor }
          : {
              path: parentId && parentId !== 'root' ? parentId : '',
              limit: 50,
              include_deleted: false,
            },
      ),
    });
    if (!res.ok) throw new Error(`Dropbox list failed: ${res.status}`);
    const json = (await res.json()) as {
      entries?: Array<{
        '.tag': string;
        id: string;
        name: string;
        path_display?: string;
        size?: number;
        client_modified?: string;
      }>;
      cursor?: string;
      has_more?: boolean;
    };
    return {
      nextCursor: json.has_more && json.cursor ? json.cursor : null,
      files: (json.entries ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        path: e.path_display ?? null,
        isFolder: e['.tag'] === 'folder',
        mimeType: e['.tag'] === 'folder' ? 'inode/directory' : null,
        sizeBytes: typeof e.size === 'number' ? e.size : null,
        modifiedAt: e.client_modified ?? null,
      })),
    };
  },

  async downloadFile(accessToken, fileId, nameHint): Promise<DownloadedFile> {
    const res = await fetch(DOWNLOAD, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: fileId }),
      },
    });
    if (!res.ok) throw new Error(`Dropbox download failed: ${res.status}`);
    const apiMeta = res.headers.get('dropbox-api-result');
    let name = nameHint || fileId;
    if (apiMeta) {
      try {
        const parsed = JSON.parse(apiMeta) as { name?: string };
        if (parsed.name) name = parsed.name;
      } catch {
        /* ignore */
      }
    }
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      filename: name,
      mimeType: contentType.split(';')[0]!.trim(),
    };
  },
};
