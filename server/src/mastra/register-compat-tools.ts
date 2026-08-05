import type { MessageCitation } from '@script/shared';
import {
  registerTool,
  type AgentToolContext,
  type ToolExecutionResult,
} from '../modules/chat/agent/registry';
import { toRequestContext } from './request-context';
import { getMastraToolStatusLabel } from './status-labels';
import { companyBrainTools } from './tools';

type AnyMastraTool = {
  id: string;
  description: string;
  inputSchema?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute?: (input: any, ctx: any) => Promise<unknown>;
};

function zodToLooseJsonSchema(schema: unknown): Record<string, unknown> {
  if (schema && typeof schema === 'object' && 'shape' in (schema as object)) {
    const shape = (schema as { shape: Record<string, unknown> }).shape;
    const properties: Record<string, unknown> = {};
    for (const key of Object.keys(shape ?? {})) {
      properties[key] = { type: 'string' };
    }
    return { type: 'object', properties, additionalProperties: true };
  }
  return { type: 'object', properties: {}, additionalProperties: true };
}

function extractCitations(data: unknown): MessageCitation[] | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const c = (data as { citations?: unknown }).citations;
  if (!Array.isArray(c) || c.length === 0) return undefined;
  return c as MessageCitation[];
}

function isErrorPayload(data: unknown): boolean {
  return Boolean(
    data && typeof data === 'object' && 'error' in data && (data as { error: unknown }).error,
  );
}

async function executeMastraTool(
  tool: AnyMastraTool,
  input: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolExecutionResult> {
  if (!tool.execute) {
    return { ok: false, data: { error: 'Tool has no execute' }, error: 'Tool has no execute' };
  }
  try {
    const data = await tool.execute(input, { requestContext: toRequestContext(ctx) });
    if (isErrorPayload(data)) {
      const err = String((data as { error: unknown }).error);
      return { ok: false, data, error: err };
    }
    return { ok: true, data, citations: extractCitations(data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool failed';
    return { ok: false, data: { error: message }, error: message };
  }
}

let registered = false;

/**
 * Registers Mastra tools into the legacy ADR 0011 registry so `executeTool` and
 * inventory hard-routes / tests keep working without a second implementation.
 */
export function registerMastraToolsOnCompatRegistry(): void {
  if (registered) return;
  registered = true;

  const tools = Object.values(companyBrainTools) as AnyMastraTool[];

  for (const tool of tools) {
    registerTool({
      statusLabel: getMastraToolStatusLabel(tool.id),
      definition: {
        name: tool.id,
        description: tool.description,
        input_schema: zodToLooseJsonSchema(tool.inputSchema) as {
          type: 'object';
          properties?: Record<string, unknown>;
        },
      },
      execute: (input, ctx) => executeMastraTool(tool, input, ctx),
    });
  }
}
