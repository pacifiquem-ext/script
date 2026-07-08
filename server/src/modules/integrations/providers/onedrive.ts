import { env } from '../../../config/env';
import type { CloudProviderAdapter, DownloadedFile, ListFilesResult, OAuthTokens } from './types';

const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['Files.Read', 'User.Read', 'offline_access', 'openid', 'email'].join(' ');

export const onedriveAdapter: CloudProviderAdapter = {
  provider: 'onedrive',
  displayName: 'OneDrive',

  isConfigured() {
    return Boolean(env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_SECRET && env.OAUTH_REDIRECT_URL);
  },

  getAuthorizationUrl(state: string) {
    const params = new URLSearchParams({
      client_id: env.ONEDRIVE_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: env.OAUTH_REDIRECT_URL!,
      response_mode: 'query',
      scope: SCOPES,
      state,
    });
    return `${AUTH}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      client_id: env.ONEDRIVE_CLIENT_ID!,
      client_secret: env.ONEDRIVE_CLIENT_SECRET!,
      code,
      redirect_uri: env.OAUTH_REDIRECT_URL!,
      grant_type: 'authorization_code',
      scope: SCOPES,
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`OneDrive token exchange failed: ${res.status}`);
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
      client_id: env.ONEDRIVE_CLIENT_ID!,
      client_secret: env.ONEDRIVE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPES,
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`OneDrive token refresh failed: ${res.status}`);
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      scopes: json.scope?.split(' ').filter(Boolean) ?? [],
    };
  },

  async getAccountEmail(accessToken: string) {
    const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { mail?: string; userPrincipalName?: string };
    return json.mail || json.userPrincipalName || null;
  },

  async listFiles(accessToken, parentId, cursor): Promise<ListFilesResult> {
    const base =
      parentId && parentId !== 'root'
        ? `${GRAPH}/me/drive/items/${encodeURIComponent(parentId)}/children`
        : `${GRAPH}/me/drive/root/children`;
    const url = cursor
      ? cursor
      : `${base}?$top=50&$select=id,name,folder,file,size,lastModifiedDateTime`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`OneDrive list failed: ${res.status}`);
    const json = (await res.json()) as {
      value?: Array<{
        id: string;
        name: string;
        folder?: unknown;
        file?: { mimeType?: string };
        size?: number;
        lastModifiedDateTime?: string;
      }>;
      '@odata.nextLink'?: string;
    };
    return {
      nextCursor: json['@odata.nextLink'] ?? null,
      files: (json.value ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        path: null,
        isFolder: Boolean(f.folder),
        mimeType: f.file?.mimeType ?? (f.folder ? 'inode/directory' : null),
        sizeBytes: typeof f.size === 'number' ? f.size : null,
        modifiedAt: f.lastModifiedDateTime ?? null,
      })),
    };
  },

  async downloadFile(accessToken, fileId, nameHint): Promise<DownloadedFile> {
    const metaRes = await fetch(
      `${GRAPH}/me/drive/items/${encodeURIComponent(fileId)}?$select=id,name,file,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaRes.ok) throw new Error(`OneDrive metadata failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as {
      name?: string;
      file?: { mimeType?: string };
    };
    const res = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(fileId)}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`OneDrive download failed: ${res.status}`);
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      filename: meta.name || nameHint || fileId,
      mimeType: meta.file?.mimeType || 'application/octet-stream',
    };
  },
};
