import { RequestContext } from '@mastra/core/request-context';
import type { AgentToolContext } from '../modules/chat/agent/registry';

export const RC_WORKSPACE_ID = 'workspaceId';
export const RC_USER_ID = 'userId';
export const RC_MAX_CLEARANCE = 'maxClearanceLevel';
export const RC_ELEVATED = 'elevated';
export const RC_CONVERSATION_ID = 'conversationId';
export const RC_BROWSER_SESSION = 'browserSessionId';
export const RC_RUN_ID = 'runId';
export const RC_SKIP_HITL = 'skipHitl';

export type ScriptRequestContextValues = {
  workspaceId: string;
  userId?: string;
  maxClearanceLevel?: number;
  elevated?: boolean;
  conversationId?: string;
  browserSessionId?: string;
  runId?: string;
  skipHitl?: boolean;
};

export type AgentToolContextWithBrowser = AgentToolContext & {
  browserSessionId?: string;
  runId?: string;
  skipHitl?: boolean;
};

export function toRequestContext(
  ctx: AgentToolContext & { browserSessionId?: string; runId?: string; skipHitl?: boolean },
): RequestContext {
  const rc = new RequestContext();
  rc.set(RC_WORKSPACE_ID, ctx.workspaceId);
  if (ctx.userId) rc.set(RC_USER_ID, ctx.userId);
  if (ctx.maxClearanceLevel !== undefined) rc.set(RC_MAX_CLEARANCE, ctx.maxClearanceLevel);
  if (ctx.elevated !== undefined) rc.set(RC_ELEVATED, ctx.elevated);
  if (ctx.conversationId) rc.set(RC_CONVERSATION_ID, ctx.conversationId);
  if (ctx.browserSessionId) rc.set(RC_BROWSER_SESSION, ctx.browserSessionId);
  if (ctx.runId) rc.set(RC_RUN_ID, ctx.runId);
  if (ctx.skipHitl !== undefined) rc.set(RC_SKIP_HITL, ctx.skipHitl);
  return rc;
}

export function toolContextFromRequestContext(rc: RequestContext): AgentToolContextWithBrowser {
  const workspaceId = rc.get(RC_WORKSPACE_ID);
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw new Error('Missing workspaceId on RequestContext — tools must not invent tenancy');
  }
  const userId = rc.get(RC_USER_ID);
  const maxClearanceLevel = rc.get(RC_MAX_CLEARANCE);
  const elevated = rc.get(RC_ELEVATED);
  const conversationId = rc.get(RC_CONVERSATION_ID);
  const skipHitl = rc.get(RC_SKIP_HITL);
  const runId = rc.get(RC_RUN_ID);
  return {
    workspaceId,
    userId: typeof userId === 'string' ? userId : undefined,
    maxClearanceLevel: typeof maxClearanceLevel === 'number' ? maxClearanceLevel : undefined,
    elevated: typeof elevated === 'boolean' ? elevated : undefined,
    conversationId: typeof conversationId === 'string' ? conversationId : undefined,
    skipHitl: typeof skipHitl === 'boolean' ? skipHitl : undefined,
    runId: typeof runId === 'string' ? runId : undefined,
    browserSessionId: browserSessionFromRequestContext(rc),
  };
}

export function browserSessionFromRequestContext(rc: RequestContext): string | undefined {
  const explicit = rc.get(RC_BROWSER_SESSION);
  if (typeof explicit === 'string' && explicit) return explicit;
  const runId = rc.get(RC_RUN_ID);
  if (typeof runId === 'string' && runId) return `run:${runId}`;
  return undefined;
}
