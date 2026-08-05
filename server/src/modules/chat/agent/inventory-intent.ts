import Anthropic from '@anthropic-ai/sdk';
import { CHAT_MODEL } from '@script/shared';
import { env, requireAnthropicApiKey } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { getCompletionProvider } from '../../ai/completion';

export type InventoryIntent = 'library_inventory' | 'meeting_inventory' | 'none';

/**
 * Production catalog routing: structured model classify (not product regex NLU).
 * Falls back to none on failure so the main tool loop can still choose tools.
 */
export async function classifyInventoryIntent(userMessage: string): Promise<InventoryIntent> {
  const text = userMessage.trim().slice(0, 2000);
  if (!text) return 'none';

  if (env.NODE_ENV === 'test') {
    return classifyInventoryIntentHeuristicForTests(text);
  }

  const system = `Classify the user message for company-brain catalog intents.
Reply with exactly one JSON object: {"intent":"library_inventory"|"meeting_inventory"|"none"}
- library_inventory: wants list/overview of documents/files/library inventory
- meeting_inventory: wants list/overview of meetings/calls (not content of a specific call)
- none: content question, search, or anything else
No markdown.`;

  try {
    const provider = getCompletionProvider();
    let raw: string;
    if (env.COMPLETION_PROVIDER === 'anthropic') {
      const client = new Anthropic({ apiKey: requireAnthropicApiKey() });
      const response = await client.messages.create({
        model: env.COMPLETION_MODEL ?? CHAT_MODEL,
        max_tokens: 40,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: text }],
      });
      raw = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
    } else {
      raw = await provider.complete({
        system,
        messages: [{ role: 'user', content: text }],
        maxTokens: 40,
      });
    }
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return 'none';
    const parsed = JSON.parse(match[0]) as { intent?: string };
    if (parsed.intent === 'library_inventory' || parsed.intent === 'meeting_inventory') {
      return parsed.intent;
    }
    return 'none';
  } catch (err) {
    logger.warn({ err }, 'inventory intent classify failed');
    return 'none';
  }
}

/** Deterministic stand-in only for unit tests (NODE_ENV=test). Not used in production. */
export function classifyInventoryIntentHeuristicForTests(text: string): InventoryIntent {
  const t = text.toLowerCase();
  if (
    /\b(whole library|my library|list (all )?(documents|files)|what('s| is) in (my |the )?library)\b/.test(
      t,
    )
  ) {
    return 'library_inventory';
  }
  if (
    /\b(what meetings|list meetings|show meetings|what calls|list (our |recent )?calls)\b/.test(t)
  ) {
    return 'meeting_inventory';
  }
  return 'none';
}
