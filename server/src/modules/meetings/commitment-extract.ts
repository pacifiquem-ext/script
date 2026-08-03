import Anthropic from '@anthropic-ai/sdk';
import { CHAT_MODEL } from '@script/shared';
import { env, requireAnthropicApiKey } from '../../config/env';
import { logger } from '../../lib/logger';
import { getCompletionProvider } from '../ai/completion';

export type ExtractedCommitment = {
  text: string;
  ownerLabel: string | null;
  dueAt: string | null;
  sourceStartMs: number | null;
};

/**
 * Production commitment extraction: prefer provider-supplied action items text,
 * then model structured extract over transcript+summary.
 */
export async function extractMeetingCommitments(input: {
  title: string;
  summary: string | null;
  transcriptText: string;
  providerActionItems?: string | null;
}): Promise<ExtractedCommitment[]> {
  const fromProvider = parseActionItemsBlob(input.providerActionItems);
  if (fromProvider.length > 0) return fromProvider.slice(0, 40);

  const transcriptSlice = input.transcriptText.slice(0, 24_000);
  const prompt = `Extract decisions and action items from this meeting.
Return ONLY a JSON array (no markdown) of objects:
{"text": string, "ownerLabel": string|null, "dueAt": ISO date string|null, "sourceStartMs": number|null}
- text: clear obligation or decision
- ownerLabel: person name if stated, else null
- dueAt: only if a date is explicit
- sourceStartMs: milliseconds from start if inferable from [mm:ss] lines, else null
Max 30 items. Empty array if none.

Title: ${input.title}
Summary: ${input.summary ?? '(none)'}
Transcript:
${transcriptSlice}`;

  try {
    const provider = getCompletionProvider();
    if (provider.id === 'anthropic' || env.COMPLETION_PROVIDER === 'anthropic') {
      if (env.NODE_ENV === 'test') return [];
      const client = new Anthropic({ apiKey: requireAnthropicApiKey() });
      const response = await client.messages.create({
        model: env.COMPLETION_MODEL ?? CHAT_MODEL,
        max_tokens: 2048,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return parseCommitmentsJson(text).slice(0, 40);
    }
    const text = await provider.complete({
      system: 'You extract structured meeting commitments as JSON only.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
    });
    return parseCommitmentsJson(text).slice(0, 40);
  } catch (err) {
    logger.error({ err }, 'meeting commitment model extract failed');
    return [];
  }
}

/** Exported for unit tests of Fireflies action_items normalization only. */
export function parseActionItemsOnlyForTest(raw: string | null | undefined): ExtractedCommitment[] {
  return parseActionItemsBlob(raw);
}

function parseActionItemsBlob(raw: string | null | undefined): ExtractedCommitment[] {
  if (!raw?.trim()) return [];
  // Fireflies often returns HTML or bullet text for action_items
  const plain = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  const lines = plain
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter((l) => l.length >= 8);
  return lines.map((text) => ({
    text: text.slice(0, 2000),
    ownerLabel: null,
    dueAt: null,
    sourceStartMs: null,
  }));
}

function parseCommitmentsJson(raw: string): ExtractedCommitment[] {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        const text = typeof o.text === 'string' ? o.text.trim() : '';
        if (!text) return null;
        return {
          text: text.slice(0, 2000),
          ownerLabel: typeof o.ownerLabel === 'string' ? o.ownerLabel : null,
          dueAt: typeof o.dueAt === 'string' ? o.dueAt : null,
          sourceStartMs:
            typeof o.sourceStartMs === 'number' && Number.isFinite(o.sourceStartMs)
              ? Math.floor(o.sourceStartMs)
              : null,
        };
      })
      .filter((x): x is ExtractedCommitment => x != null);
  } catch {
    return [];
  }
}
