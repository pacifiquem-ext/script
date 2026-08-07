import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  browserClick,
  browserNavigate,
  browserPress,
  browserSnapshot,
  browserType,
  browserWait,
} from '../../modules/workflows/browser-session';
import { RC_BROWSER_SESSION, RC_RUN_ID, RC_USER_ID, RC_WORKSPACE_ID } from '../request-context';
import type { RequestContext } from '@mastra/core/request-context';

function sessionKeyFromRc(rc: RequestContext): string {
  const explicit = rc.get(RC_BROWSER_SESSION);
  if (typeof explicit === 'string' && explicit) return explicit;
  const workspaceId = rc.get(RC_WORKSPACE_ID);
  const userId = rc.get(RC_USER_ID);
  const runId = rc.get(RC_RUN_ID);
  if (typeof runId === 'string' && runId) return `run:${runId}`;
  if (typeof workspaceId === 'string' && typeof userId === 'string') {
    return `user:${workspaceId}:${userId}`;
  }
  if (typeof workspaceId === 'string') return `ws:${workspaceId}`;
  throw new Error('Missing browser session context (workspace/run)');
}

function toolError(err: unknown): { error: string } {
  return { error: err instanceof Error ? err.message : String(err) };
}

export const browserNavigateTool = createTool({
  id: 'browser_navigate',
  description:
    'Open a URL in the headless browser (Playwright). Use for workflow steps like “Go to github.com”. Accepts bare domains or full https URLs.',
  inputSchema: z.object({
    url: z.string().min(1).describe('URL or domain, e.g. https://github.com or github.com'),
  }),
  execute: async (input, { requestContext }) => {
    try {
      const key = sessionKeyFromRc(requestContext);
      const snap = await browserNavigate(key, input.url);
      return { ok: true, ...snap };
    } catch (err) {
      return toolError(err);
    }
  },
});

export const browserSnapshotTool = createTool({
  id: 'browser_snapshot',
  description:
    'Read the current page URL, title, and visible text. Call after navigation/clicks to verify the step succeeded.',
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) => {
    try {
      const key = sessionKeyFromRc(requestContext);
      const snap = await browserSnapshot(key);
      return { ok: true, ...snap };
    } catch (err) {
      return toolError(err);
    }
  },
});

export const browserClickTool = createTool({
  id: 'browser_click',
  description:
    'Click an element by CSS selector or by visible text. Prefer text for buttons/links when the label is known.',
  inputSchema: z.object({
    selector: z.string().optional().describe('CSS selector'),
    text: z.string().optional().describe('Visible text on the control'),
  }),
  execute: async (input, { requestContext }) => {
    try {
      const key = sessionKeyFromRc(requestContext);
      const snap = await browserClick(key, input);
      return { ok: true, ...snap };
    } catch (err) {
      return toolError(err);
    }
  },
});

export const browserTypeTool = createTool({
  id: 'browser_type',
  description: 'Type into an input by CSS selector, accessible label, or placeholder text.',
  inputSchema: z.object({
    value: z.string().describe('Text to type'),
    selector: z.string().optional(),
    text: z.string().optional().describe('Label or placeholder to find the field'),
    clear: z.boolean().optional().describe('Clear existing value first'),
  }),
  execute: async (input, { requestContext }) => {
    try {
      const key = sessionKeyFromRc(requestContext);
      const snap = await browserType(key, input);
      return { ok: true, ...snap };
    } catch (err) {
      return toolError(err);
    }
  },
});

export const browserPressTool = createTool({
  id: 'browser_press',
  description: 'Press a keyboard key (Enter, Tab, Escape, etc.) on the focused page.',
  inputSchema: z.object({
    key: z.string().min(1).describe('Playwright key name, e.g. Enter'),
  }),
  execute: async (input, { requestContext }) => {
    try {
      const key = sessionKeyFromRc(requestContext);
      const snap = await browserPress(key, input.key);
      return { ok: true, ...snap };
    } catch (err) {
      return toolError(err);
    }
  },
});

export const browserWaitTool = createTool({
  id: 'browser_wait',
  description: 'Wait for a short delay or until text appears on the page.',
  inputSchema: z.object({
    ms: z.number().int().positive().max(15_000).optional(),
    text: z.string().optional(),
  }),
  execute: async (input, { requestContext }) => {
    try {
      const key = sessionKeyFromRc(requestContext);
      const snap = await browserWait(key, input);
      return { ok: true, ...snap };
    } catch (err) {
      return toolError(err);
    }
  },
});

export const browserTools = {
  browserNavigateTool,
  browserSnapshotTool,
  browserClickTool,
  browserTypeTool,
  browserPressTool,
  browserWaitTool,
};
