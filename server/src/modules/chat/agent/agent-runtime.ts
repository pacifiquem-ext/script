import type { MessageCitation } from '@script/shared';
import { env } from '../../../config/env';
import { logger } from '../../../lib/logger';
import {
  AGENT_SYSTEM_PROMPT,
  companyBrainAgent,
  getMastraToolStatusLabel,
  toRequestContext,
} from '../../../mastra';
import { classifyInventoryIntent } from './inventory-intent';
import {
  executeTool,
  getToolStatusLabel,
  recordToolCallAudit,
  type AgentToolContext,
  type ToolExecutionResult,
} from './registry';
import { registerBuiltinTools } from './register-builtin-tools';

registerBuiltinTools();

export type AgentStreamEvent =
  | { type: 'tool_call'; name: string; input: unknown; statusLabel?: string }
  | { type: 'tool_result'; name: string; ok: boolean }
  | { type: 'delta'; text: string }
  | { type: 'citations'; citations: MessageCitation[] }
  | {
      type: 'write_confirm';
      tool: string;
      confirmToken: string;
      runId: string;
      stepKey: string;
      summary?: string;
    };

export type AgentRunInput = {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  toolContext: AgentToolContext;
  signal?: AbortSignal;
  maxRounds?: number;
};

export type AgentRunner = (input: AgentRunInput) => AsyncGenerator<AgentStreamEvent>;

const DEFAULT_MAX_STEPS = 6;

async function auditTool(
  toolContext: AgentToolContext,
  name: string,
  result: ToolExecutionResult,
  started: number,
) {
  await recordToolCallAudit({
    workspaceId: toolContext.workspaceId,
    userId: toolContext.userId,
    conversationId: toolContext.conversationId,
    tool: name,
    ok: result.ok,
    durationMs: Date.now() - started,
    error: result.error,
  });
}

async function* runForcedLibraryInventory(
  toolContext: AgentToolContext,
): AsyncGenerator<AgentStreamEvent> {
  const started = Date.now();
  yield {
    type: 'tool_call',
    name: 'list_library_documents',
    input: { limit: 50 },
    statusLabel: getToolStatusLabel('list_library_documents'),
  };
  const result = await executeTool('list_library_documents', { limit: 50 }, toolContext);
  await auditTool(toolContext, 'list_library_documents', result, started);
  yield { type: 'tool_result', name: 'list_library_documents', ok: result.ok };
  const docs =
    result.ok && result.data && typeof result.data === 'object' && 'documents' in result.data
      ? (
          result.data as {
            total: number;
            documents: Array<{ name: string; summary: string | null; status: string }>;
          }
        ).documents
      : [];
  const total =
    result.ok && result.data && typeof result.data === 'object' && 'total' in result.data
      ? Number((result.data as { total: number }).total)
      : docs.length;
  const lines = docs.map(
    (d, i) => `${i + 1}. **${d.name}** (${d.status}) — ${d.summary || '(no summary yet)'}`,
  );
  const more =
    total > docs.length ? `\n\n…and ${total - docs.length} more not shown (raise limit).` : '';
  const text =
    lines.length > 0
      ? `Here is your Library inventory (${docs.length} of ${total} document${total === 1 ? '' : 's'}):\n\n${lines.join('\n')}${more}`
      : 'Your Library has no documents yet. Upload files in the Library to build company memory.';
  yield { type: 'delta', text };
}

async function* runForcedMeetingInventory(
  toolContext: AgentToolContext,
): AsyncGenerator<AgentStreamEvent> {
  const started = Date.now();
  yield {
    type: 'tool_call',
    name: 'list_meetings',
    input: { limit: 20 },
    statusLabel: getToolStatusLabel('list_meetings'),
  };
  const result = await executeTool('list_meetings', { limit: 20 }, toolContext);
  await auditTool(toolContext, 'list_meetings', result, started);
  yield { type: 'tool_result', name: 'list_meetings', ok: result.ok };
  const meetings =
    result.ok && result.data && typeof result.data === 'object' && 'meetings' in result.data
      ? (
          result.data as {
            total: number;
            meetings: Array<{
              title: string;
              summary: string | null;
              status: string;
              startedAt: string | null;
            }>;
          }
        ).meetings
      : [];
  const total =
    result.ok && result.data && typeof result.data === 'object' && 'total' in result.data
      ? Number((result.data as { total: number }).total)
      : meetings.length;
  const lines = meetings.map(
    (m, i) =>
      `${i + 1}. **${m.title}** (${m.status}${m.startedAt ? `, ${m.startedAt.slice(0, 10)}` : ''}) — ${m.summary || '(no summary yet)'}`,
  );
  const more = total > meetings.length ? `\n\n…and ${total - meetings.length} more not shown.` : '';
  const text =
    lines.length > 0
      ? `Here are your meetings (${meetings.length} of ${total}):\n\n${lines.join('\n')}${more}`
      : 'No meetings in this workspace yet. Import a transcript from the Meetings page.';
  yield { type: 'delta', text };
}

function collectCitationsFromToolResult(
  result: unknown,
  citationMap: Map<string, MessageCitation>,
) {
  if (!result || typeof result !== 'object') return;
  const citations = (result as { citations?: MessageCitation[] }).citations;
  if (!Array.isArray(citations)) return;
  for (const c of citations) {
    if (c?.chunkId) citationMap.set(c.chunkId, c);
  }
}

function writeConfirmFromToolResult(
  toolName: string,
  result: unknown,
): Extract<AgentStreamEvent, { type: 'write_confirm' }> | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (r.needsConfirmation !== true) return null;
  const confirmationId =
    typeof r.confirmationId === 'string'
      ? r.confirmationId
      : typeof r.confirmToken === 'string'
        ? r.confirmToken
        : '';
  if (!confirmationId) return null;
  if (typeof r.runId !== 'string' || typeof r.stepKey !== 'string') return null;
  let summary: string | undefined;
  if (r.evidence && typeof r.evidence === 'object') {
    const s = (r.evidence as { summary?: unknown }).summary;
    if (typeof s === 'string' && s.trim()) summary = s;
  }
  if (!summary && typeof r.message === 'string') summary = r.message;
  return {
    type: 'write_confirm',
    tool: toolName,
    confirmToken: confirmationId,
    runId: r.runId,
    stepKey: r.stepKey,
    summary,
  };
}

/**
 * Production agent loop via Mastra (ADR 0017).
 * Inventory intents hard-routed for Library and Meetings (no product regex NLU for inventory —
 * classifier in inventory-intent.ts).
 */
export async function* runAgentWithTools(input: AgentRunInput): AsyncGenerator<AgentStreamEvent> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const inventory = await classifyInventoryIntent(lastUser);
  if (inventory === 'library_inventory') {
    yield* runForcedLibraryInventory(input.toolContext);
    return;
  }
  if (inventory === 'meeting_inventory') {
    yield* runForcedMeetingInventory(input.toolContext);
    return;
  }

  const requestContext = toRequestContext(input.toolContext);
  const maxSteps = input.maxRounds ?? DEFAULT_MAX_STEPS;
  const citationMap = new Map<string, MessageCitation>();
  const toolStarted = new Map<string, number>();

  // Mastra accepts several message shapes; product history is role+content strings.
  const mastraMessages = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  })) as Parameters<typeof companyBrainAgent.stream>[0];

  try {
    const stream = await companyBrainAgent.stream(mastraMessages, {
      requestContext,
      instructions: input.system || AGENT_SYSTEM_PROMPT,
      maxSteps,
      abortSignal: input.signal,
      hooks: {
        afterToolCall: async ({ toolName, output, error }) => {
          const started = toolStarted.get(toolName) ?? Date.now();
          const ok =
            !error && !(output && typeof output === 'object' && 'error' in (output as object));
          await recordToolCallAudit({
            workspaceId: input.toolContext.workspaceId,
            userId: input.toolContext.userId,
            conversationId: input.toolContext.conversationId,
            tool: toolName,
            ok,
            durationMs: Date.now() - started,
            error: error instanceof Error ? error.message : error ? String(error) : undefined,
          });
        },
      },
    });

    for await (const chunk of stream.fullStream) {
      if (input.signal?.aborted) return;
      const type = (chunk as { type: string }).type;
      const payload = ((chunk as { payload?: Record<string, unknown> }).payload ?? {}) as Record<
        string,
        unknown
      >;

      if (type === 'text-delta') {
        const text = typeof payload.text === 'string' ? payload.text : '';
        if (text) yield { type: 'delta', text };
        continue;
      }

      if (type === 'tool-call') {
        const name = String(payload.toolName ?? 'tool');
        const args = payload.args ?? {};
        toolStarted.set(name, Date.now());
        yield {
          type: 'tool_call',
          name,
          input: args,
          statusLabel: getMastraToolStatusLabel(name),
        };
        continue;
      }

      if (type === 'tool-result') {
        const name = String(payload.toolName ?? 'tool');
        const isError = Boolean(payload.isError);
        const result = payload.result;
        collectCitationsFromToolResult(result, citationMap);
        yield { type: 'tool_result', name, ok: !isError };
        const writeConfirm = writeConfirmFromToolResult(name, result);
        if (writeConfirm) yield writeConfirm;
        continue;
      }
    }

    if (citationMap.size) {
      yield { type: 'citations', citations: [...citationMap.values()] };
    }
  } catch (err) {
    logger.error({ err }, 'Mastra company-brain agent failed');
    throw err;
  }
}

/** Deterministic test runner mirroring production hard inventory + tool paths. */
export async function* defaultTestAgentRunner(
  input: AgentRunInput,
): AsyncGenerator<AgentStreamEvent> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const lower = lastUser.toLowerCase();

  const inventory = await classifyInventoryIntent(lastUser);
  if (inventory === 'library_inventory') {
    yield* runForcedLibraryInventory(input.toolContext);
    return;
  }
  if (inventory === 'meeting_inventory') {
    yield* runForcedMeetingInventory(input.toolContext);
    return;
  }

  if (/web search|search the web|look up online|latest news/.test(lower)) {
    yield {
      type: 'tool_call',
      name: 'web_search',
      input: { query: lastUser },
      statusLabel: getToolStatusLabel('web_search'),
    };
    const started = Date.now();
    const result = await executeTool(
      'web_search',
      { query: lastUser, maxResults: 3 },
      input.toolContext,
    );
    await auditTool(input.toolContext, 'web_search', result, started);
    yield { type: 'tool_result', name: 'web_search', ok: result.ok };
    yield {
      type: 'delta',
      text: result.ok
        ? `Web search results:\n${JSON.stringify(result.data, null, 2).slice(0, 1500)}`
        : `Web search unavailable: ${JSON.stringify(result.data)}`,
    };
    return;
  }

  if (/\bmeeting\b|\bcall\b|\btranscript\b|\bwho said\b/.test(lower)) {
    yield {
      type: 'tool_call',
      name: 'search_meetings',
      input: { query: lastUser },
      statusLabel: getToolStatusLabel('search_meetings'),
    };
    const started = Date.now();
    const search = await executeTool('search_meetings', { query: lastUser }, input.toolContext);
    await auditTool(input.toolContext, 'search_meetings', search, started);
    yield { type: 'tool_result', name: 'search_meetings', ok: search.ok };
    if (search.citations?.length) yield { type: 'citations', citations: search.citations };
    const hits =
      search.ok && search.data && typeof search.data === 'object' && 'hits' in search.data
        ? (search.data as { hits: Array<{ meetingTitle: string; excerpt: string }> }).hits
        : [];
    yield {
      type: 'delta',
      text:
        hits.length > 0
          ? `Based on your meetings:\n\n${hits.map((h, i) => `[${i + 1}] ${h.meetingTitle}\n${h.excerpt}`).join('\n\n')}`
          : 'I could not find relevant content in meeting transcripts for that question.',
    };
    return;
  }

  const scopeMatch = lastUser.match(/explicitly scoped these document ids[^:]*:\s*([a-z0-9,\s]+)/i);
  const scopedIds = scopeMatch?.[1]
    ? scopeMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const question = lastUser.split('\n\nThe user explicitly scoped')[0] ?? lastUser;

  yield {
    type: 'tool_call',
    name: 'search_library',
    input: { query: question, documentIds: scopedIds },
    statusLabel: getToolStatusLabel('search_library'),
  };
  const started = Date.now();
  const search = await executeTool(
    'search_library',
    { query: question, documentIds: scopedIds },
    input.toolContext,
  );
  await auditTool(input.toolContext, 'search_library', search, started);
  yield { type: 'tool_result', name: 'search_library', ok: search.ok };
  if (search.citations?.length) {
    yield { type: 'citations', citations: search.citations };
  }
  const hits =
    search.ok && search.data && typeof search.data === 'object' && 'hits' in search.data
      ? (search.data as { hits: Array<{ documentName: string; excerpt: string }> }).hits
      : [];
  if (hits.length === 0) {
    yield {
      type: 'delta',
      text: 'I could not find relevant content in your Library for that question. Try naming a document or listing the library.',
    };
    return;
  }
  const body = hits.map((h, i) => `[${i + 1}] ${h.documentName}\n${h.excerpt}`).join('\n\n');
  yield {
    type: 'delta',
    text: `Based on your Library:\n\n${body}`,
  };
}

let agentRunner: AgentRunner = env.NODE_ENV === 'test' ? defaultTestAgentRunner : runAgentWithTools;

export function setAgentRunnerForTests(runner: AgentRunner | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setAgentRunnerForTests is only available in test');
  }
  agentRunner = runner ?? defaultTestAgentRunner;
}

/** @deprecated Prefer Mastra stream; retained for tests that stub Anthropic message create. */
export function setAnthropicMessagesCreateForTests(_fn: unknown) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setAnthropicMessagesCreateForTests is only available in test');
  }
  // No-op: production loop is Mastra; agent-runtime tests use setAgentRunnerForTests.
}

export function getAgentRunner(): AgentRunner {
  return agentRunner;
}

export { AGENT_SYSTEM_PROMPT };
