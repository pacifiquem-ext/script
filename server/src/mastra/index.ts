import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { companyBrainAgent, COMPANY_BRAIN_AGENT_ID } from './agents/company-brain';

/**
 * Mastra composition root (ADR 0017).
 * Product chat/Slack call agents in-process — do not expose unauthenticated Mastra HTTP.
 * Product Conversation/Message stay in Prisma; LibSQL is only Mastra internal runtime state.
 */
export const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'script-mastra', url: ':memory:' }),
  agents: {
    companyBrainAgent,
  },
});

export {
  companyBrainAgent,
  COMPANY_BRAIN_AGENT_ID,
  AGENT_SYSTEM_PROMPT,
} from './agents/company-brain';
export { toRequestContext, toolContextFromRequestContext } from './request-context';
export { getMastraToolStatusLabel, TOOL_STATUS_LABELS } from './status-labels';
export { companyBrainTools } from './tools';
export { setWebSearchForTests, webSearch } from './tools/web-search';
