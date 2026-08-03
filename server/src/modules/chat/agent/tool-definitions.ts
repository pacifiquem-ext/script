/**
 * Compatibility facade — tools live in the registry (ADR 0011).
 * Domain modules register via register-builtin-tools.
 */
import { registerBuiltinTools } from './register-builtin-tools';
import {
  executeTool,
  getToolDefinitions,
  type AgentToolContext,
  type ToolExecutionResult,
} from './registry';

registerBuiltinTools();

export type { ToolExecutionResult, AgentToolContext };

/** @deprecated Prefer getToolDefinitions() — kept for external imports */
export function getAgentToolDefinitions() {
  return getToolDefinitions();
}

export const AGENT_TOOL_DEFINITIONS = new Proxy([] as ReturnType<typeof getToolDefinitions>, {
  get(_target, prop, receiver) {
    const defs = getToolDefinitions();
    if (prop === 'length') return defs.length;
    if (prop === Symbol.iterator) return defs[Symbol.iterator].bind(defs);
    if (typeof prop === 'string' && /^\d+$/.test(prop)) return defs[Number(prop)];
    return Reflect.get(defs, prop, receiver);
  },
});

export async function executeAgentTool(
  name: string,
  rawInput: unknown,
  ctx: AgentToolContext,
): Promise<ToolExecutionResult> {
  return executeTool(name, rawInput, ctx);
}
