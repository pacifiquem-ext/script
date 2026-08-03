import Anthropic from '@anthropic-ai/sdk';
import {
  CHAT_MAX_TOKENS,
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  type MessageCitation,
} from '@script/shared';
import { env, requireAnthropicApiKey } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { classifyInventoryIntent } from './inventory-intent';
import {
  executeTool,
  getToolDefinitions,
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
  | { type: 'citations'; citations: MessageCitation[] };

export type AgentRunInput = {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  toolContext: AgentToolContext;
  signal?: AbortSignal;
  maxRounds?: number;
};

export type AgentRunner = (input: AgentRunInput) => AsyncGenerator<AgentStreamEvent>;

export type AnthropicMessagesCreate = (params: {
  system: string;
  messages: Anthropic.Messages.MessageParam[];
  tools: Anthropic.Messages.Tool[];
  signal?: AbortSignal;
}) => Promise<Anthropic.Messages.Message>;

const DEFAULT_MAX_ROUNDS = 6;

type ContentBlock = Anthropic.Messages.ContentBlock;
type MessageParam = Anthropic.Messages.MessageParam;

function textFromContent(content: ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function toolUses(content: ContentBlock[]): Anthropic.Messages.ToolUseBlock[] {
  return content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use');
}

const defaultAnthropicCreate: AnthropicMessagesCreate = async (params) => {
  const client = new Anthropic({ apiKey: requireAnthropicApiKey() });
  return client.messages.create(
    {
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      temperature: CHAT_TEMPERATURE,
      system: params.system,
      tools: params.tools,
      messages: params.messages,
    },
    { signal: params.signal },
  );
};

let anthropicCreateImpl: AnthropicMessagesCreate = defaultAnthropicCreate;

export function setAnthropicMessagesCreateForTests(fn: AnthropicMessagesCreate | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setAnthropicMessagesCreateForTests is only available in test');
  }
  anthropicCreateImpl = fn ?? defaultAnthropicCreate;
}

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
            meetings: Array<{ title: string; summary: string | null; status: string; startedAt: string | null }>;
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
  const more =
    total > meetings.length ? `\n\n…and ${total - meetings.length} more not shown.` : '';
  const text =
    lines.length > 0
      ? `Here are your meetings (${meetings.length} of ${total}):\n\n${lines.join('\n')}${more}`
      : 'No meetings in this workspace yet. Import a transcript from the Meetings page.';
  yield { type: 'delta', text };
}

/**
 * Tool-use agent loop via registry (ADR 0011).
 * Inventory intents hard-routed for Library and Meetings.
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

  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const tools = getToolDefinitions();
  const messages: MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const citationMap = new Map<string, MessageCitation>();

  for (let round = 0; round < maxRounds; round++) {
    if (input.signal?.aborted) return;

    const response = await anthropicCreateImpl({
      system: input.system,
      messages,
      tools,
      signal: input.signal,
    });

    const uses = toolUses(response.content);
    if (response.stop_reason === 'tool_use' && uses.length > 0) {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const use of uses) {
        yield {
          type: 'tool_call',
          name: use.name,
          input: use.input,
          statusLabel: getToolStatusLabel(use.name),
        };
        const started = Date.now();
        const result: ToolExecutionResult = await executeTool(
          use.name,
          use.input,
          input.toolContext,
        );
        await auditTool(input.toolContext, use.name, result, started);
        yield { type: 'tool_result', name: use.name, ok: result.ok };
        if (result.citations) {
          for (const c of result.citations) {
            citationMap.set(c.chunkId, c);
          }
        }
        const payload = JSON.stringify(result.data);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: payload.length > 80_000 ? `${payload.slice(0, 80_000)}…[truncated]` : payload,
          is_error: !result.ok,
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const text = textFromContent(response.content);
    if (text) yield { type: 'delta', text };
    if (citationMap.size) {
      yield { type: 'citations', citations: [...citationMap.values()] };
    }
    return;
  }

  logger.warn({ maxRounds }, 'agent hit max tool rounds; requesting final answer');
  const final = await anthropicCreateImpl({
    system: `${input.system}\n\nYou have used the maximum number of tool rounds. Answer now with what you have.`,
    messages,
    tools: [],
    signal: input.signal,
  });
  const text = textFromContent(final.content);
  if (text) yield { type: 'delta', text };
  if (citationMap.size) {
    yield { type: 'citations', citations: [...citationMap.values()] };
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

  const scopeMatch = lastUser.match(
    /explicitly scoped these document ids[^:]*:\s*([a-z0-9,\s]+)/i,
  );
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
  const body = hits
    .map((h, i) => `[${i + 1}] ${h.documentName}\n${h.excerpt}`)
    .join('\n\n');
  yield {
    type: 'delta',
    text: `Based on your Library:\n\n${body}`,
  };
}

let agentRunner: AgentRunner =
  env.NODE_ENV === 'test' ? defaultTestAgentRunner : runAgentWithTools;

export function setAgentRunnerForTests(runner: AgentRunner | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setAgentRunnerForTests is only available in test');
  }
  agentRunner = runner ?? defaultTestAgentRunner;
}

export function getAgentRunner(): AgentRunner {
  return agentRunner;
}

export const AGENT_SYSTEM_PROMPT = `You are script, the company brain assistant for this workspace.

You have tools:
- list_library_documents — inventory of Library files with one-line summaries (use for "what's in my library", overviews, listing files).
- get_document_summary — one document by id or name.
- search_library — semantic search of document content (use for questions about what documents say).
- list_meetings — inventory of meetings/calls with summaries.
- get_meeting_summary — one meeting by id or title (summary, participants, commitments).
- search_meetings — semantic search over meeting transcripts (decisions, who said what).
- web_search — public web search for external facts (not a substitute for Library or meetings).

Rules:
1. For library inventory / "all documents" / "one-line summary each file" questions, call list_library_documents. Do NOT claim you lack access to the Library when this tool works.
2. For meeting inventory / "what meetings do we have?", call list_meetings. Do NOT claim you lack meeting access when this tool works.
3. For document content questions, call search_library. For call/meeting content, call search_meetings.
4. Prefer company memory tools over web_search. Use web_search only for external/public information.
5. Never invent documents or meetings that tools did not return. Never expose secrets or credentials.
6. Be concise and helpful. If tools return empty, say so clearly.`;