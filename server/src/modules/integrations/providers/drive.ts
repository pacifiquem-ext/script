import { env } from '../../../config/env';
import type { CloudProviderAdapter, DownloadedFile, ListFilesResult, OAuthTokens } from './types';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const ABOUT = 'https://www.googleapis.com/drive/v3/about';
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'openid', 'email'].join(' ');

export const driveAdapter: CloudProviderAdapter = {
  provider: 'drive',
  displayName: 'Google Drive',

  isConfigured() {
    return Boolean(
      env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.OAUTH_REDIRECT_URL,
    );
  },

  getAuthorizationUrl(state: string) {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_DRIVE_CLIENT_ID!,
      redirect_uri: env.OAUTH_REDIRECT_URL!,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      code,
      client_id: env.GOOGLE_DRIVE_CLIENT_ID!,
      client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET!,
      redirect_uri: env.OAUTH_REDIRECT_URL!,
      grant_type: 'authorization_code',
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
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
      client_id: env.GOOGLE_DRIVE_CLIENT_ID!,
      client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
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
    const res = await fetch(`${ABOUT}?fields=user(emailAddress)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { user?: { emailAddress?: string } };
    return json.user?.emailAddress ?? null;
  },

  async listFiles(accessToken, parentId, cursor): Promise<ListFilesResult> {
    const q = parentId
      ? `'${parentId.replace(/'/g, "\\'")}' in parents and trashed=false`
      : `'root' in parents and trashed=false`;
    const params = new URLSearchParams({
      q,
      pageSize: '50',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)',
      orderBy: 'folder,name',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (cursor) params.set('pageToken', cursor);
    const res = await fetch(`${FILES}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const json = (await res.json()) as {
      nextPageToken?: string;
      files?: Array<{
        id: string;
        name: string;
        mimeType?: string;
        size?: string;
        modifiedTime?: string;
      }>;
    };
    return {
      nextCursor: json.nextPageToken ?? null,
      files: (json.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        path: null,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
        mimeType: f.mimeType ?? null,
        sizeBytes: f.size ? Number(f.size) : null,
        modifiedAt: f.modifiedTime ?? null,
      })),
    };
  },

  async downloadFile(accessToken, fileId, nameHint): Promise<DownloadedFile> {
    const metaRes = await fetch(
      `${FILES}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaRes.ok) throw new Error(`Drive metadata failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { name?: string; mimeType?: string };
    const mime = meta.mimeType ?? 'application/octet-stream';
    const name = meta.name || nameHint || fileId;

    // Google Docs/Sheets export
    if (mime.startsWith('application/vnd.google-apps.')) {
      const exportMime =
        mime === 'application/vnd.google-apps.document'
          ? 'application/pdf'
          : mime === 'application/vnd.google-apps.spreadsheet'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf';
      const exportRes = await fetch(
        `${FILES}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!exportRes.ok) throw new Error(`Drive export failed: ${exportRes.status}`);
      const buffer = Buffer.from(await exportRes.arrayBuffer());
      const ext =
        exportMime === 'application/pdf'
          ? '.pdf'
          : exportMime.includes('spreadsheet')
            ? '.xlsx'
            : '';
      return {
        buffer,
        filename: name.endsWith(ext) ? name : `${name}${ext}`,
        mimeType: exportMime,
      };
    }

    const res = await fetch(`${FILES}/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      filename: name,
      mimeType: mime,
    };
  },
};

// silence unused redirect helper in case of future absolute URL building
