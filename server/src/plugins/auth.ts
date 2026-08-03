import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_WORKSPACE_ID,
  WORKSPACE_HEADER,
} from '@script/shared';
import { UnauthorizedError, ForbiddenError } from '../common/errors';
import { prisma } from '../db/prisma';
import { assertSameOrigin } from '../lib/origin';
import { verifyAccessToken } from '../lib/tokens';
import * as authService from '../modules/auth/auth-service';
import { findApiKey } from '../modules/api-keys/api-keys-service';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  lastWorkspaceId: string | null;
}

export interface WorkspaceContext {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  clearanceLevel: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null;
    workspace: WorkspaceContext | null;
    authViaApiKey: boolean;
  }
}

async function resolveUser(request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer sk_')) {
    const raw = authHeader.slice('Bearer '.length).trim();
    const ua = request.headers['user-agent'];
    const apiKey = await findApiKey(raw, {
      ip: request.ip,
      userAgent: typeof ua === 'string' ? ua : null,
    });
    if (!apiKey) return null;
    request.authViaApiKey = true;
    request.workspace = {
      id: apiKey.workspaceId,
      name: 'api-key',
      role: 'admin',
      clearanceLevel: 100,
    };
    if (apiKey.createdBy) {
      return {
        id: apiKey.createdBy.id,
        email: apiKey.createdBy.email,
        name: apiKey.createdBy.name,
        lastWorkspaceId: apiKey.workspaceId,
      };
    }
    return {
      id: `api-key:${apiKey.id}`,
      email: `api-key@${apiKey.workspaceId}.local`,
      name: apiKey.name,
      lastWorkspaceId: apiKey.workspaceId,
    };
  }

  const access = request.cookies[COOKIE_ACCESS_TOKEN];
  if (access) {
    try {
      const payload = await verifyAccessToken(access);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (user) {
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          lastWorkspaceId: user.lastWorkspaceId,
        };
      }
    } catch {
      // refresh below
    }
  }

  if (!request.cookies[COOKIE_REFRESH_TOKEN]) return null;
  try {
    const result = await authService.refreshSession(request, reply);
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      lastWorkspaceId: result.user.lastWorkspaceId,
    };
  } catch {
    return null;
  }
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('authUser', null);
  app.decorateRequest('workspace', null);
  app.decorateRequest('authViaApiKey', false);

  app.addHook('preHandler', async (request, reply) => {
    if (!request.headers.authorization?.startsWith('Bearer sk_')) {
      assertSameOrigin(request);
    }
    request.authViaApiKey = false;
    request.workspace = null;
    request.authUser = await resolveUser(request, reply);
  });
}

export async function requireAuth(request: FastifyRequest): Promise<AuthUser> {
  if (!request.authUser) throw new UnauthorizedError();
  return request.authUser;
}

export async function requireWorkspace(request: FastifyRequest): Promise<{
  user: AuthUser;
  workspace: WorkspaceContext;
}> {
  const user = await requireAuth(request);
  if (request.authViaApiKey && request.workspace) {
    return { user, workspace: request.workspace };
  }
  const headerId = request.headers[WORKSPACE_HEADER];
  const workspaceId =
    (typeof headerId === 'string' && headerId) ||
    request.cookies[COOKIE_WORKSPACE_ID] ||
    user.lastWorkspaceId;
  if (!workspaceId) throw new ForbiddenError('No active workspace');
  if (user.id.startsWith('api-key:')) throw new ForbiddenError('Not a member of this workspace');
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: { workspace: { select: { name: true } } },
  });
  if (!membership) throw new ForbiddenError('Not a member of this workspace');
  request.workspace = {
    id: workspaceId,
    name: membership.workspace.name,
    role: membership.role,
    clearanceLevel: membership.clearanceLevel,
  };
  return { user, workspace: request.workspace };
}

export function requireWorkspaceRole(
  workspace: WorkspaceContext,
  allowed: Array<WorkspaceContext['role']>,
): void {
  if (!allowed.includes(workspace.role)) {
    throw new ForbiddenError('Insufficient workspace permissions');
  }
}
