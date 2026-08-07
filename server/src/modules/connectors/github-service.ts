import { prisma } from '../../db/prisma';
import { setMemoryChunkEmbedding } from '../../db/vector';
import { encryptSecret, decryptSecret, hasTokenEncryptionKey } from '../../lib/token-crypto';
import { BadRequestError, NotFoundError } from '../../common/errors';
import { assertLicenseAllowsWrite } from '../license/license-service';
import { logger } from '../../lib/logger';
import { recordAudit } from '../audit/audit-service';
import { upsertPersonIdentity } from '../clearance/clearance-service';
import { chunkText } from '../jobs/extract';
import { embedTexts } from '../jobs/embeddings';

const PROVIDER = 'github';

type GhIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  updated_at: string;
  user?: { login: string; id: number } | null;
  assignee?: { login: string; id: number; email?: string | null } | null;
  pull_request?: unknown;
};

async function ghFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'script-company-brain',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new BadRequestError(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function connectGitHub(
  workspaceId: string,
  userId: string,
  token: string,
  repos: string[],
) {
  await assertLicenseAllowsWrite();
  if (!hasTokenEncryptionKey()) {
    throw new BadRequestError('TOKEN_ENCRYPTION_KEY is required to store GitHub tokens');
  }
  const clean = token.trim();
  if (clean.length < 20) throw new BadRequestError('Invalid GitHub token');
  // Validate token
  await ghFetch<{ login: string }>(clean, '/user');

  const connector = await prisma.systemConnector.upsert({
    where: { workspaceId_provider: { workspaceId, provider: PROVIDER } },
    create: {
      workspaceId,
      provider: PROVIDER,
      encryptedCredentials: encryptSecret(
        JSON.stringify({ token: clean, repos: repos.map((r) => r.trim()).filter(Boolean) }),
      ),
      scopes: ['repo', 'read:user'],
      status: 'connected',
      consentAt: new Date(),
      installedById: userId,
      lastError: null,
    },
    update: {
      encryptedCredentials: encryptSecret(
        JSON.stringify({ token: clean, repos: repos.map((r) => r.trim()).filter(Boolean) }),
      ),
      status: 'connected',
      consentAt: new Date(),
      installedById: userId,
      lastError: null,
    },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'connector.connect',
    targetType: 'system_connector',
    targetId: connector.id,
    metadata: { provider: PROVIDER, repos },
  });

  return { connected: true as const, provider: PROVIDER };
}

export async function disconnectGitHub(workspaceId: string, userId: string) {
  await assertLicenseAllowsWrite();
  const connector = await prisma.systemConnector.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: PROVIDER } },
  });
  if (connector) {
    const items = await prisma.workItem.findMany({
      where: {
        workspaceId,
        OR: [{ project: { connectorId: connector.id } }, { externalId: { startsWith: 'github:' } }],
      },
      select: { id: true, externalId: true },
    });
    const keys = [...new Set(items.flatMap((i) => [i.externalId, i.id]))];
    if (keys.length > 0) {
      await prisma.memorySource.deleteMany({
        where: { workspaceId, type: 'work_item', externalKey: { in: keys } },
      });
    }
    if (items.length > 0) {
      await prisma.workItem.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
    }
    await prisma.systemConnector.delete({ where: { id: connector.id } });
  }
  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'connector.disconnect',
    targetType: 'system_connector',
    metadata: { provider: PROVIDER },
  });
  return { connected: false as const };
}

export async function getGitHubStatus(workspaceId: string) {
  const c = await prisma.systemConnector.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: PROVIDER } },
  });
  let repos: string[] = [];
  if (c) {
    try {
      const creds = JSON.parse(decryptSecret(c.encryptedCredentials)) as { repos?: string[] };
      repos = creds.repos ?? [];
    } catch {
      repos = [];
    }
  }
  return {
    provider: PROVIDER,
    connected: Boolean(c && c.status === 'connected'),
    lastSyncAt: c?.lastSyncAt?.toISOString() ?? null,
    lastError: c?.lastError ?? null,
    repos,
  };
}

function parseCreds(raw: string): { token: string; repos: string[] } {
  const j = JSON.parse(decryptSecret(raw)) as { token: string; repos?: string[] };
  return { token: j.token, repos: j.repos ?? [] };
}

export async function syncGitHub(workspaceId: string, userId: string) {
  await assertLicenseAllowsWrite();
  const connector = await prisma.systemConnector.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: PROVIDER } },
  });
  if (!connector) throw new NotFoundError('GitHub connector');
  const { token, repos } = parseCreds(connector.encryptedCredentials);
  if (!repos.length) throw new BadRequestError('No repositories configured (owner/name)');

  let imported = 0;
  for (const full of repos) {
    const [owner, name] = full.split('/');
    if (!owner || !name) continue;
    const project = await prisma.workProject.upsert({
      where: {
        connectorId_externalId: { connectorId: connector.id, externalId: full },
      },
      create: {
        workspaceId,
        connectorId: connector.id,
        externalId: full,
        name: full,
        url: `https://github.com/${full}`,
        visibility: 'workspace',
        clearanceLevel: 0,
      },
      update: { name: full, url: `https://github.com/${full}` },
    });

    const issues = await ghFetch<GhIssue[]>(
      token,
      `/repos/${owner}/${name}/issues?state=all&per_page=50`,
    );
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const externalId = `github:${full}#${issue.number}`;
      let assigneeUserId: string | null = null;
      if (issue.assignee) {
        await upsertPersonIdentity({
          workspaceId,
          provider: 'github',
          externalId: String(issue.assignee.id),
          displayName: issue.assignee.login,
          email: issue.assignee.email,
        });
        const id = await prisma.personIdentity.findUnique({
          where: {
            workspaceId_provider_externalId: {
              workspaceId,
              provider: 'github',
              externalId: String(issue.assignee.id),
            },
          },
        });
        assigneeUserId = id?.userId ?? null;
      }
      const workItem = await prisma.workItem.upsert({
        where: {
          workspaceId_externalId: { workspaceId, externalId },
        },
        create: {
          workspaceId,
          projectId: project.id,
          externalId,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          assigneeExternalId: issue.assignee ? String(issue.assignee.id) : null,
          assigneeUserId,
          url: issue.html_url,
          externalUpdatedAt: new Date(issue.updated_at),
          visibility: 'workspace',
          clearanceLevel: 0,
        },
        update: {
          title: issue.title,
          body: issue.body,
          state: issue.state,
          assigneeExternalId: issue.assignee ? String(issue.assignee.id) : null,
          assigneeUserId,
          url: issue.html_url,
          externalUpdatedAt: new Date(issue.updated_at),
          projectId: project.id,
        },
      });
      await indexWorkItemMemory({
        workspaceId,
        workItemId: workItem.id,
        externalId: workItem.externalId,
        title: issue.title,
        body: issue.body,
        issueNumber: issue.number,
      });
      imported += 1;
    }
  }

  await prisma.systemConnector.update({
    where: { id: connector.id },
    data: { lastSyncAt: new Date(), lastError: null },
  });
  logger.info({ workspaceId, userId, imported }, 'github sync complete');
  return { imported };
}

export async function indexWorkItemMemory(input: {
  workspaceId: string;
  workItemId: string;
  externalId: string;
  title: string;
  body: string | null;
  issueNumber: string | number;
}): Promise<void> {
  const externalKey = input.externalId || input.workItemId;
  let source = await prisma.memorySource.findFirst({
    where: { workspaceId: input.workspaceId, type: 'work_item', externalKey },
  });
  if (!source) {
    source = await prisma.memorySource.create({
      data: {
        workspaceId: input.workspaceId,
        type: 'work_item',
        title: input.title,
        externalKey,
      },
    });
  } else if (source.title !== input.title) {
    source = await prisma.memorySource.update({
      where: { id: source.id },
      data: { title: input.title },
    });
  }

  const text = [input.title.trim(), input.body?.trim()].filter(Boolean).join('\n\n');
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    await prisma.memoryChunk.deleteMany({ where: { memorySourceId: source.id } });
    return;
  }

  let embeddings: number[][] = [];
  try {
    embeddings = await embedTexts(
      chunks.map((c) => c.content),
      'document',
    );
  } catch (err) {
    logger.warn(
      { err, workItemId: input.workItemId },
      'work item embed failed; storing text chunks only',
    );
  }

  const issueNumber = String(input.issueNumber);
  await prisma.$transaction(async (tx) => {
    await tx.memoryChunk.deleteMany({ where: { memorySourceId: source.id } });
    await tx.memoryChunk.createMany({
      data: chunks.map((chunk, i) => ({
        memorySourceId: source.id,
        workspaceId: input.workspaceId,
        sourceType: 'work_item' as const,
        position: i,
        content: chunk.content,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        pageNumber: chunk.pageNumber,
        externalId: issueNumber,
      })),
    });
    if (embeddings.length === 0) return;
    const rows = await tx.memoryChunk.findMany({
      where: { memorySourceId: source.id },
      select: { id: true, position: true },
      orderBy: { position: 'asc' },
    });
    for (const row of rows) {
      const emb = embeddings[row.position];
      if (emb) await setMemoryChunkEmbedding(tx, row.id, emb);
    }
  });
}

/** Live assignee/state from GitHub so answers are not stale. */
export async function liveGetWorkItem(
  workspaceId: string,
  externalId: string,
): Promise<{
  title: string;
  state: string;
  assignee: string | null;
  url: string;
  bodyPreview: string | null;
} | null> {
  const local = await prisma.workItem.findFirst({
    where: { workspaceId, externalId },
    include: { project: true },
  });
  if (!local?.project) return null;
  const connector = await prisma.systemConnector.findUnique({
    where: { id: local.project.connectorId },
  });
  if (!connector) return null;
  const { token } = parseCreds(connector.encryptedCredentials);
  const m = externalId.match(/^github:([^/]+\/[^#]+)#(\d+)$/);
  if (!m) {
    return {
      title: local.title,
      state: local.state,
      assignee: local.assigneeExternalId,
      url: local.url ?? '',
      bodyPreview: local.body?.slice(0, 500) ?? null,
    };
  }
  const [, repo, num] = m;
  const issue = await ghFetch<GhIssue>(token, `/repos/${repo}/issues/${num}`);
  return {
    title: issue.title,
    state: issue.state,
    assignee: issue.assignee?.login ?? null,
    url: issue.html_url,
    bodyPreview: issue.body?.slice(0, 500) ?? null,
  };
}

export async function listWorkItemsLocal(
  workspaceId: string,
  input: { q?: string; state?: string; limit?: number },
) {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const rows = await prisma.workItem.findMany({
    where: {
      workspaceId,
      ...(input.state ? { state: input.state } : {}),
      ...(input.q?.trim()
        ? { title: { contains: input.q.trim(), mode: 'insensitive' as const } }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { project: { select: { name: true } } },
  });
  return {
    total: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      title: r.title,
      state: r.state,
      project: r.project?.name ?? null,
      url: r.url,
      assigneeUserId: r.assigneeUserId,
    })),
  };
}
