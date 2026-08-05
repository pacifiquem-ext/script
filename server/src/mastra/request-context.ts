import { RequestContext } from '@mastra/core/request-context';
import type { AgentToolContext } from '../modules/chat/agent/registry';

export const RC_WORKSPACE_ID = 'workspaceId';
export const RC_USER_ID = 'userId';
export const RC_MAX_CLEARANCE = 'maxClearanceLevel';
export const RC_ELEVATED = 'elevated';
export const RC_CONVERSATION_ID = 'conversationId';

export type ScriptRequestContextValues = {
  workspaceId: string;
  userId?: string;
  maxClearanceLevel?: number;
  elevated?: boolean;
  conversationId?: string;
};

export function toRequestContext(ctx: AgentToolContext): RequestContext {
  const rc = new RequestContext();
  rc.set(RC_WORKSPACE_ID, ctx.workspaceId);
  if (ctx.userId) rc.set(RC_USER_ID, ctx.userId);
  if (ctx.maxClearanceLevel !== undefined) rc.set(RC_MAX_CLEARANCE, ctx.maxClearanceLevel);
  if (ctx.elevated !== undefined) rc.set(RC_ELEVATED, ctx.elevated);
  if (ctx.conversationId) rc.set(RC_CONVERSATION_ID, ctx.conversationId);
  return rc;
}

export function toolContextFromRequestContext(rc: RequestContext): AgentToolContext {
  const workspaceId = rc.get(RC_WORKSPACE_ID);
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw new Error('Missing workspaceId on RequestContext — tools must not invent tenancy');
  }
  const userId = rc.get(RC_USER_ID);
  const maxClearanceLevel = rc.get(RC_MAX_CLEARANCE);
  const elevated = rc.get(RC_ELEVATED);
  const conversationId = rc.get(RC_CONVERSATION_ID);
  return {
    workspaceId,
    userId: typeof userId === 'string' ? userId : undefined,
    maxClearanceLevel: typeof maxClearanceLevel === 'number' ? maxClearanceLevel : undefined,
    elevated: typeof elevated === 'boolean' ? elevated : undefined,
    conversationId: typeof conversationId === 'string' ? conversationId : undefined,
  };
}
