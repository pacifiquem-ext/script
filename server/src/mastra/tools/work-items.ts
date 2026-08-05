import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getWorkItemTool,
  listWorkItemsTool as listWorkItemsService,
} from '../../modules/connectors/work-tools';
import { toolContextFromRequestContext } from '../request-context';

export const listWorkItemsTool = createTool({
  id: 'list_work_items',
  description:
    'List normalized work items (issues) from connected work systems (e.g. GitHub). Use for "what issues are open?" inventory.',
  inputSchema: z.object({
    q: z.string().optional(),
    state: z.string().optional().describe('open | closed'),
    limit: z.number().optional(),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    return listWorkItemsService(ctx, {
      q: input.q,
      state: input.state,
      limit: input.limit,
    });
  },
});

export const getWorkItemMastraTool = createTool({
  id: 'get_work_item',
  description:
    'Get a work item by externalId (e.g. github:org/repo#12) or title. Live-fetches assignee/state from GitHub when connected so status is not stale.',
  inputSchema: z.object({
    externalId: z.string().optional(),
    title: z.string().optional(),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    const item = await getWorkItemTool(ctx, {
      externalId: input.externalId,
      title: input.title,
    });
    if (!item) return { error: 'Work item not found' };
    return item;
  },
});
