import Anthropic from '@anthropic-ai/sdk';
import { CHAT_MAX_TOKENS, CHAT_MODEL, CHAT_TEMPERATURE } from '@script/shared';
import { ConfigurationError } from '../../common/errors';
import { env, requireAnthropicApiKey } from '../../config/env';
import { logger } from '../../lib/logger';

export type CompletionMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export interface CompletionProvider {
  readonly id: string;
  readonly supportsTools: boolean;
  /** Simple non-tool completion (fallback / openai-compatible without tools). */
  complete(input: {
    system: string;
    messages: CompletionMessage[];
    maxTokens?: number;
  }): Promise<string>;
  /** Anthropic Messages API client when tools are required; null if unsupported. */
  getAnthropicClient(): Anthropic | null;
  getModel(): string;
}

class AnthropicCompletionProvider implements CompletionProvider {
  readonly id = 'anthropic';
  readonly supportsTools = true;

  getAnthropicClient(): Anthropic {
    return new Anthropic({ apiKey: requireAnthropicApiKey() });
  }

  getModel(): string {
    return env.COMPLETION_MODEL ?? CHAT_MODEL;
  }

  async complete(input: {
    system: string;
    messages: CompletionMessage[];
    maxTokens?: number;
  }): Promise<string> {
    const client = this.getAnthropicClient();
    const response = await client.messages.create({
      model: this.getModel(),
      max_tokens: input.maxTokens ?? CHAT_MAX_TOKENS,
      temperature: CHAT_TEMPERATURE,
      system: input.system,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return text;
  }
}

/** OpenAI-compatible chat completions (Ollama, vLLM, OpenAI, etc.). Tools optional / degraded. */
class OpenAICompatibleCompletionProvider implements CompletionProvider {
  readonly id = 'openai_compatible';
  readonly supportsTools = false;

  getAnthropicClient(): null {
    return null;
  }

  getModel(): string {
    return env.COMPLETION_MODEL ?? 'llama3.1';
  }

  async complete(input: {
    system: string;
    messages: CompletionMessage[];
    maxTokens?: number;
  }): Promise<string> {
    const base = env.COMPLETION_BASE_URL?.replace(/\/$/, '');
    if (!base) {
      throw new ConfigurationError('COMPLETION_BASE_URL is required for openai_compatible');
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (env.COMPLETION_API_KEY) {
      headers.Authorization = `Bearer ${env.COMPLETION_API_KEY}`;
    }
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.getModel(),
        max_tokens: input.maxTokens ?? CHAT_MAX_TOKENS,
        temperature: CHAT_TEMPERATURE,
        messages: [
          { role: 'system', content: input.system },
          ...input.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body: body.slice(0, 200) }, 'openai-compatible completion failed');
      throw new ConfigurationError(
        `Completion provider failed: ${response.status} ${body.slice(0, 120)}`,
      );
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content ?? '';
  }
}

let provider: CompletionProvider | null = null;

export function getCompletionProvider(): CompletionProvider {
  if (provider) return provider;
  if (env.NODE_ENV === 'test') {
    provider = {
      id: 'test',
      supportsTools: true,
      getAnthropicClient: () => null,
      getModel: () => 'test',
      complete: async () => 'test completion',
    };
    return provider;
  }
  if (env.COMPLETION_PROVIDER === 'openai_compatible') {
    provider = new OpenAICompatibleCompletionProvider();
  } else {
    provider = new AnthropicCompletionProvider();
  }
  return provider;
}

export function setCompletionProviderForTests(next: CompletionProvider | null): void {
  provider = next;
}
