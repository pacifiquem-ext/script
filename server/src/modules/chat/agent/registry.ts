import type Anthropic from '@anthropic-ai/sdk';
import type { MessageCitation } from '@script/shared';
import { prisma } from '../../../db/prisma';
import { logger } from '../../../lib/logger';

export type AgentToolContext = {
  workspaceId: string;
  userId?: string;
  maxClearanceLevel?: number;
  conversationId?: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  data: unknown;
  citations?: MessageCitation[];
  error?: string;
};

export type RegisteredTool = {
  definition: Anthropic.Messages.Tool;
  /** Live status line shown in chat while the tool runs */
  statusLabel: string;
  execute: (input: Record<string, unknown>, ctx: AgentToolContext) => Promise<ToolExecutionResult>;
};

const tools = new Map<string, RegisteredTool>();

export function registerTool(tool: RegisteredTool): void {
  const name = tool.definition.name;
  if (!name) throw new Error('Tool definition requires name');
  if (tools.has(name)) {
    logger.warn({ tool: name }, 'registerTool overwriting existing tool');
  }
  tools.set(name, tool);
}

export function getRegisteredTool(name: string): RegisteredTool | undefined {
  return tools.get(name);
}

export function getToolDefinitions(): Anthropic.Messages.Tool[] {
  return [...tools.values()].map((t) => t.definition);
}

export function getToolStatusLabel(name: string): string {
  return tools.get(name)?.statusLabel ?? `Running ${name}…`;
}

export function listRegisteredToolNames(): string[] {
  return [...tools.keys()];
}

export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: AgentToolContext,
): Promise<ToolExecutionResult> {
  const tool = tools.get(name);
  if (!tool) {
    return { ok: false, data: { error: `Unknown tool: ${name}` }, error: `Unknown tool: ${name}` };
  }
  const input =
    rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : {};
  try {
    return await tool.execute(input, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool failed';
    return { ok: false, data: { error: message }, error: message };
  }
}

export async function recordToolCallAudit(input: {
  workspaceId: string;
  userId?: string;
  conversationId?: string;
  tool: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}): Promise<void> {
  logger.info(
    {
      event: 'agent_tool_audit',
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      tool: input.tool,
      ok: input.ok,
      durationMs: input.durationMs,
    },
    'agent tool call',
  );
  try {
    await prisma.agentToolCall.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        conversationId: input.conversationId ?? null,
        tool: input.tool,
        ok: input.ok,
        durationMs: input.durationMs,
        error: input.error ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, tool: input.tool }, 'failed to persist AgentToolCall');
  }
}

/** Test helper: clear registry between suites if needed */
export function clearToolRegistryForTests(): void {
  tools.clear();
}
