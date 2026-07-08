import type { IntegrationProvider } from '@script/shared';

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: string[];
  accountEmail?: string | null;
};

export type CloudFileEntry = {
  id: string;
  name: string;
  path: string | null;
  isFolder: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
};

export type ListFilesResult = {
  files: CloudFileEntry[];
  nextCursor: string | null;
};

export type DownloadedFile = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

export interface CloudProviderAdapter {
  readonly provider: IntegrationProvider;
  readonly displayName: string;
  isConfigured(): boolean;
  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
  listFiles(
    accessToken: string,
    parentId?: string | null,
    cursor?: string | null,
  ): Promise<ListFilesResult>;
  downloadFile(accessToken: string, fileId: string, nameHint?: string): Promise<DownloadedFile>;
  getAccountEmail?(accessToken: string): Promise<string | null>;
}
