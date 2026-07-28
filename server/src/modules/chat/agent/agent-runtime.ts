import Anthropic from '@anthropic-ai/sdk';
import {
  CHAT_MAX_TOKENS,
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  type MessageCitation,
} from '@script/shared';
import { env, requireAnthropicApiKey } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { isLibraryInventoryIntent } from './library-intent';
import {
  AGENT_TOOL_DEFINITIONS,
  executeAgentTool,
  type ToolExecutionResult,
} from './tool-definitions';
import type { LibraryToolContext } from './library-tools';

export type AgentStreamEvent =
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; ok: boolean }
  | { type: 'delta'; text: string }
  | { type: 'citations'; citations: MessageCitation[] };

export type AgentRunInput = {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  toolContext: LibraryToolContext & { userId?: string };
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

function logToolAudit(input: {
  workspaceId: string;
  userId?: string;
  name: string;
  ok: boolean;
  ms: number;
}) {
  logger.info(
    {
      event: 'agent_tool_audit',
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      tool: input.name,
      ok: input.ok,
      durationMs: input.ms,
    },
    'agent tool call',
  );
}

async function* runForcedLibraryInventory(
  toolContext: LibraryToolContext & { userId?: string },
): AsyncGenerator<AgentStreamEvent> {
  const started = Date.now();
  yield { type: 'tool_call', name: 'list_library_documents', input: { limit: 50 } };
  const result = await executeAgentTool('list_library_documents', { limit: 50 }, toolContext);
  logToolAudit({
    workspaceId: toolContext.workspaceId,
    userId: toolContext.userId,
    name: 'list_library_documents',
    ok: result.ok,
    ms: Date.now() - started,
  });
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

/**
 * Tool-use agent loop: Library tools + web_search.
 * Inventory intents are hard-routed to list_library_documents (P0 reliability).
 */
export async function* runAgentWithTools(input: AgentRunInput): AsyncGenerator<AgentStreamEvent> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  if (isLibraryInventoryIntent(lastUser)) {
    yield* runForcedLibraryInventory(input.toolContext);
    return;
  }

  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const tools = AGENT_TOOL_DEFINITIONS;
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
        yield { type: 'tool_call', name: use.name, input: use.input };
        const started = Date.now();
        const result: ToolExecutionResult = await executeAgentTool(
          use.name,
          use.input,
          input.toolContext,
        );
        logToolAudit({
          workspaceId: input.toolContext.workspaceId,
          userId: input.toolContext.userId,
          name: use.name,
          ok: result.ok,
          ms: Date.now() - started,
        });
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

  if (isLibraryInventoryIntent(lastUser)) {
    yield* runForcedLibraryInventory(input.toolContext);
    return;
  }

  if (/web search|search the web|look up online|latest news/.test(lower)) {
    yield { type: 'tool_call', name: 'web_search', input: { query: lastUser } };
    const started = Date.now();
    const result = await executeAgentTool(
      'web_search',
      { query: lastUser, maxResults: 3 },
      input.toolContext,
    );
    logToolAudit({
      workspaceId: input.toolContext.workspaceId,
      userId: input.toolContext.userId,
      name: 'web_search',
      ok: result.ok,
      ms: Date.now() - started,
    });
    yield { type: 'tool_result', name: 'web_search', ok: result.ok };
    yield {
      type: 'delta',
      text: result.ok
        ? `Web search results:\n${JSON.stringify(result.data, null, 2).slice(0, 1500)}`
        : `Web search unavailable: ${JSON.stringify(result.data)}`,
    };
    return;
  }

  // Extract scoped document ids if chat-service appended them
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
  };
  const started = Date.now();
  const search = await executeAgentTool(
    'search_library',
    { query: question, documentIds: scopedIds },
    input.toolContext,
  );
  logToolAudit({
    workspaceId: input.toolContext.workspaceId,
    userId: input.toolContext.userId,
    name: 'search_library',
    ok: search.ok,
    ms: Date.now() - started,
  });
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
- web_search — public web search for external facts (not a substitute for Library content).

Rules:
1. For library inventory / "all documents" / "one-line summary each file" questions, call list_library_documents. Do NOT claim you lack access to the Library when this tool works.
2. For content questions, call search_library (optionally after listing). Cite library hits with bracket numbers matching the order of search hits you used.
3. Prefer Library tools over web_search for company documents. Use web_search only for external/public information.
4. Never invent documents that tools did not return. Never expose secrets or credentials.
5. Be concise and helpful. If tools return empty, say so clearly.`;
