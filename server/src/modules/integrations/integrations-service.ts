import {
  integrationProviderSchema,
  type ImportCloudFilesBody,
  type IntegrationProvider,
  type ListCloudFilesQuery,
  type PublicIntegration,
} from '@script/shared';
import { BadRequestError, ConfigurationError, NotFoundError } from '../../common/errors';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { decryptSecret, encryptSecret, hasTokenEncryptionKey } from '../../lib/token-crypto';
import { logger } from '../../lib/logger';
import { createDocumentFromBuffer } from '../library/library-service';
import { createOAuthState, parseOAuthState } from './oauth-state';
import { ALL_PROVIDERS, getProviderAdapter, listProviderAdapters } from './providers/registry';

function toPublic(row: {
  id: string;
  provider: IntegrationProvider;
  accountEmail: string | null;
  status: 'connected' | 'disconnected' | 'error';
  statusMessage: string | null;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
}): PublicIntegration {
  return {
    id: row.id,
    provider: row.provider,
    accountEmail: row.accountEmail,
    status: row.status,
    statusMessage: row.statusMessage,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function appPublicUrl() {
  return (env.APP_PUBLIC_URL || env.primaryCorsOrigin).replace(/\/$/, '');
}

export function listIntegrations(workspaceId: string) {
  return prisma.integration
    .findMany({
      where: { workspaceId, status: { not: 'disconnected' } },
      orderBy: { provider: 'asc' },
    })
    .then(async (rows) => {
      const byProvider = new Map(rows.map((r) => [r.provider, r]));
      return {
        providers: listProviderAdapters().map((adapter) => {
          const row = byProvider.get(adapter.provider);
          return {
            provider: adapter.provider,
            configured: adapter.isConfigured() && hasTokenEncryptionKey(),
            connected: Boolean(row && row.status === 'connected'),
            integration: row ? toPublic(row) : null,
          };
        }),
      };
    });
}

export async function startConnect(
  workspaceId: string,
  userId: string,
  providerRaw: string,
): Promise<{ url: string; provider: IntegrationProvider }> {
  const provider = integrationProviderSchema.parse(providerRaw);
  const adapter = getProviderAdapter(provider);
  if (!adapter.isConfigured()) {
    throw new ConfigurationError(
      `${adapter.displayName} OAuth is not configured. Set client ID/secret and OAUTH_REDIRECT_URL in server/.env.`,
    );
  }
  if (!hasTokenEncryptionKey()) {
    throw new ConfigurationError(
      'TOKEN_ENCRYPTION_KEY is required to connect cloud providers (encrypt tokens at rest).',
    );
  }
  if (!env.OAUTH_REDIRECT_URL) {
    throw new ConfigurationError('OAUTH_REDIRECT_URL is required for OAuth callbacks');
  }
  const state = createOAuthState({ provider, workspaceId, userId });
  return { url: adapter.getAuthorizationUrl(state), provider };
}

export async function handleOAuthCallback(input: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}): Promise<string> {
  const frontend = appPublicUrl();
  if (input.error) {
    return `${frontend}/app/library?integration=error&message=${encodeURIComponent(input.error)}`;
  }
  if (!input.code || !input.state) {
    return `${frontend}/app/library?integration=error&message=${encodeURIComponent('Missing code or state')}`;
  }
  try {
    const state = parseOAuthState(input.state);
    const adapter = getProviderAdapter(state.provider);
    const tokens = await adapter.exchangeCode(input.code);
    const accountEmail = tokens.accountEmail ?? `${state.provider}@unknown.local`;

    await prisma.integration.upsert({
      where: {
        workspaceId_provider_accountEmail: {
          workspaceId: state.workspaceId,
          provider: state.provider,
          accountEmail,
        },
      },
      create: {
        workspaceId: state.workspaceId,
        provider: state.provider,
        accountEmail,
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt ?? null,
        scopes: tokens.scopes,
        status: 'connected',
        statusMessage: null,
      },
      update: {
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
        tokenExpiresAt: tokens.expiresAt ?? null,
        scopes: tokens.scopes,
        status: 'connected',
        statusMessage: null,
      },
    });

    return `${frontend}/app/library?integration=connected&provider=${state.provider}`;
  } catch (err) {
    logger.error({ err }, 'oauth callback failed');
    const message = err instanceof Error ? err.message : 'OAuth failed';
    return `${frontend}/app/library?integration=error&message=${encodeURIComponent(message)}`;
  }
}

export async function disconnect(workspaceId: string, providerRaw: string) {
  const provider = integrationProviderSchema.parse(providerRaw);
  const rows = await prisma.integration.findMany({ where: { workspaceId, provider } });
  if (!rows.length) throw new NotFoundError('Integration');
  await prisma.integration.updateMany({
    where: { workspaceId, provider },
    data: {
      status: 'disconnected',
      statusMessage: 'Disconnected by user',
      accessTokenEncrypted: encryptSecret('revoked'),
      refreshTokenEncrypted: null,
    },
  });
  return { ok: true as const };
}

async function getLiveAccessToken(workspaceId: string, provider: IntegrationProvider) {
  const integration = await prisma.integration.findFirst({
    where: { workspaceId, provider, status: 'connected' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!integration) throw new NotFoundError(`${provider} integration`);

  let accessToken = decryptSecret(integration.accessTokenEncrypted);
  const refreshToken = integration.refreshTokenEncrypted
    ? decryptSecret(integration.refreshTokenEncrypted)
    : null;
  const expiresSoon =
    integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() < Date.now() + 60_000;

  if (expiresSoon && refreshToken) {
    try {
      const adapter = getProviderAdapter(provider);
      const refreshed = await adapter.refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessTokenEncrypted: encryptSecret(refreshed.accessToken),
          refreshTokenEncrypted: refreshed.refreshToken
            ? encryptSecret(refreshed.refreshToken)
            : integration.refreshTokenEncrypted,
          tokenExpiresAt: refreshed.expiresAt ?? null,
          status: 'connected',
          statusMessage: null,
        },
      });
    } catch (err) {
      logger.warn({ err, provider, workspaceId }, 'token refresh failed');
      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: 'error', statusMessage: 'Token refresh failed — reconnect the provider' },
      });
      throw new BadRequestError(
        'Cloud provider session expired — reconnect in Settings → Integrations',
      );
    }
  }

  return { accessToken, integration };
}

export async function listCloudFiles(
  workspaceId: string,
  providerRaw: string,
  query: ListCloudFilesQuery,
) {
  const provider = integrationProviderSchema.parse(providerRaw);
  const adapter = getProviderAdapter(provider);
  const { accessToken } = await getLiveAccessToken(workspaceId, provider);
  const result = await adapter.listFiles(accessToken, query.parentId ?? null, query.cursor ?? null);
  return {
    files: result.files,
    nextCursor: result.nextCursor,
    parentId: query.parentId ?? null,
  };
}

export async function importCloudFiles(
  workspaceId: string,
  userId: string,
  providerRaw: string,
  body: ImportCloudFilesBody,
) {
  const provider = integrationProviderSchema.parse(providerRaw);
  const adapter = getProviderAdapter(provider);
  const { accessToken } = await getLiveAccessToken(workspaceId, provider);

  const documents: Array<{
    id: string;
    name: string;
    status: string;
    deduplicated?: boolean;
    versioned?: boolean;
  }> = [];
  const failed: Array<{ fileId: string; name?: string; error: string }> = [];

  for (const fileId of body.fileIds) {
    try {
      const downloaded = await adapter.downloadFile(accessToken, fileId);
      if (!downloaded.buffer.byteLength) {
        failed.push({ fileId, name: downloaded.filename, error: 'Empty file' });
        continue;
      }
      if (downloaded.buffer.byteLength > env.MAX_UPLOAD_BYTES) {
        failed.push({
          fileId,
          name: downloaded.filename,
          error: `File exceeds max upload size (${env.MAX_UPLOAD_BYTES} bytes)`,
        });
        continue;
      }
      const result = await createDocumentFromBuffer({
        workspaceId,
        userId,
        filename: downloaded.filename,
        mimeType: downloaded.mimeType,
        buffer: downloaded.buffer,
        folderId: body.folderId ?? null,
        source: provider,
        sourceUrl: `${provider}://${fileId}`,
      });
      documents.push({
        id: result.document.id,
        name: result.document.name,
        status: result.document.status,
        deduplicated: result.deduplicated,
        versioned: 'versioned' in result ? Boolean(result.versioned) : false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      failed.push({ fileId, error: message });
      logger.warn({ err, fileId, provider, workspaceId }, 'cloud file import failed');
    }
  }

  return {
    imported: documents.length,
    documents,
    failed,
  };
}

export function assertKnownProvider(provider: string): IntegrationProvider {
  return integrationProviderSchema.parse(provider);
}

export { ALL_PROVIDERS };
