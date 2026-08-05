import { describe, expect, it } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { COMPANY_BRAIN_AGENT_ID, companyBrainAgent, mastra } from '../src/mastra';
import { listLibraryDocumentsTool, webSearchTool } from '../src/mastra/tools';
import { setWebSearchForTests } from '../src/mastra/tools/web-search';
import { toRequestContext } from '../src/mastra/request-context';
import { listRegisteredToolNames } from '../src/modules/chat/agent/registry';
import { registerBuiltinTools } from '../src/modules/chat/agent/register-builtin-tools';

describe('Mastra company-brain baseline', () => {
  it('registers company-brain agent on Mastra instance', () => {
    const agent = mastra.getAgentById(COMPANY_BRAIN_AGENT_ID);
    expect(agent).toBe(companyBrainAgent);
    expect(companyBrainAgent.id).toBe(COMPANY_BRAIN_AGENT_ID);
  });

  it('compat registry exposes Mastra tool ids', () => {
    registerBuiltinTools();
    const names = listRegisteredToolNames();
    expect(names).toContain('list_library_documents');
    expect(names).toContain('search_library');
    expect(names).toContain('web_search');
    expect(names).toContain('list_meetings');
    expect(names).toContain('list_work_items');
    expect(names).toContain('list_workflows');
    expect(names).toContain('get_my_workflow_progress');
    expect(names).toContain('complete_workflow_step');
  });

  it('list_library_documents tool fails closed without workspaceId on RequestContext', async () => {
    const rc = new RequestContext();
    await expect(
      listLibraryDocumentsTool.execute!({ q: 'x' }, { requestContext: rc }),
    ).rejects.toThrow(/workspaceId/);
  });

  it('web_search tool uses Mastra/tavily path and test double', async () => {
    setWebSearchForTests(async (query) => [
      { title: 'Hit', url: 'https://example.com', snippet: `about ${query}` },
    ]);
    const rc = toRequestContext({ workspaceId: 'ws_test' });
    const out = await webSearchTool.execute!(
      { query: 'mastra', maxResults: 2 },
      {
        requestContext: rc,
      },
    );
    expect(out).toMatchObject({
      results: [{ title: 'Hit', url: 'https://example.com' }],
    });
    setWebSearchForTests(null);
  });
});
