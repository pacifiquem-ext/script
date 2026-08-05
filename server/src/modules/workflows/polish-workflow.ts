import { createHash } from 'node:crypto';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';
import { getCompletionProvider } from '../ai/completion';
import { parseWorkflowMarkdown } from './parse-workflow-markdown';

const CHECKLIST_RE = /^(\s*-\s+\[[ xX]\]\s+)(.+?)(\s*)$/;

/** Normalize bare domains and tidy checklist wording without an LLM. */
export function polishWorkflowMarkdownDeterministic(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  return lines
    .map((line) => {
      const m = CHECKLIST_RE.exec(line);
      if (!m) return line.replace(/[ \t]+$/g, '');
      const prefix = m[1] ?? '';
      let label = (m[2] ?? '').trim().replace(/\s+/g, ' ');

      // "Go to Github.com" / "Visit example.com/path" → include https
      label = label.replace(
        /\b((?:go\s+to|visit|open|navigate\s+to|browse\s+to)\s+)(?!https?:\/\/)([a-z0-9][-a-z0-9.]+\.[a-z]{2,}(?:\/[^\s]*)?)/gi,
        (_full, verb: string, host: string) => `${verb}https://${host}`,
      );
      // Bare full URL without scheme at start of remaining text after verb already handled
      label = label.replace(
        /(?<!https?:\/\/)\b([a-z0-9][-a-z0-9]*\.(?:com|org|net|io|dev|ai|co)(?:\/[^\s]*)?)\b/gi,
        (host) => {
          // Only rewrite when it's the sole target of a go/visit style step
          if (/^(go\s+to|visit|open|navigate\s+to|browse\s+to)\s+/i.test(label)) {
            return host;
          }
          return host;
        },
      );
      // Capitalize first letter of imperative steps
      if (label.length > 1) {
        label = label.charAt(0).toUpperCase() + label.slice(1);
      }
      // Normalize common typos
      label = label
        .replace(/\bGithub\.com\b/gi, 'github.com')
        .replace(/\bhttps:\/\/Github\.com\b/gi, 'https://github.com')
        .replace(/\bhttps:\/\/github\.com\b/gi, 'https://github.com')
        .replace(/\bin in\b/gi, 'in')
        .replace(/\s{2,}/g, ' ')
        .trim();

      return `${prefix}${label}`;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function completionReady(): boolean {
  if (env.NODE_ENV === 'test') return false;
  if (env.COMPLETION_PROVIDER === 'openai_compatible') {
    return Boolean(env.COMPLETION_BASE_URL);
  }
  return Boolean(env.ANTHROPIC_API_KEY || env.COMPLETION_API_KEY);
}

/**
 * Polish markdown for clarity. Always runs deterministic rules; optionally LLM
 * when a completion provider is configured (keeps same number of checklist steps).
 */
export async function polishWorkflowMarkdown(markdown: string): Promise<{
  markdown: string;
  changed: boolean;
  method: 'deterministic' | 'llm';
}> {
  const base = polishWorkflowMarkdownDeterministic(markdown);
  const beforeHash = createHash('sha256').update(markdown).digest('hex');
  const baseHash = createHash('sha256').update(base).digest('hex');

  if (!completionReady()) {
    return {
      markdown: base,
      changed: beforeHash !== baseHash,
      method: 'deterministic',
    };
  }

  const parsedBefore = parseWorkflowMarkdown(base);
  if (parsedBefore.steps.length === 0) {
    return { markdown: base, changed: beforeHash !== baseHash, method: 'deterministic' };
  }

  try {
    const provider = getCompletionProvider();
    const system = `You polish company onboarding / process workflow markdown.
Rules:
- Keep valid markdown with the same structure: one # title, ## sections, and - [ ] / - [x] checklist steps.
- Keep the SAME number of checklist steps in the SAME order. Do not add or remove steps.
- Make each checklist line a clear imperative instruction (what to do).
- Expand bare domains to https:// URLs in navigate-style steps (e.g. Go to https://github.com).
- Fix typos and grammar. Do not invent credentials or secrets.
- Return ONLY the polished markdown, no code fence or commentary.`;

    const polished = await provider.complete({
      system,
      messages: [{ role: 'user', content: base.slice(0, 12_000) }],
      maxTokens: 4096,
    });

    let text = polished.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:markdown|md)?\n?/i, '').replace(/\n?```$/i, '');
    }
    text = polishWorkflowMarkdownDeterministic(text);
    const parsedAfter = parseWorkflowMarkdown(text);
    // Reject LLM output that drops/adds steps
    if (parsedAfter.steps.length !== parsedBefore.steps.length || !parsedAfter.title) {
      logger.warn(
        {
          before: parsedBefore.steps.length,
          after: parsedAfter.steps.length,
        },
        'workflow polish LLM rejected: step count mismatch',
      );
      return {
        markdown: base,
        changed: beforeHash !== baseHash,
        method: 'deterministic',
      };
    }
    const afterHash = createHash('sha256').update(text).digest('hex');
    return {
      markdown: text,
      changed: afterHash !== beforeHash,
      method: 'llm',
    };
  } catch (err) {
    logger.warn({ err }, 'workflow polish LLM failed; using deterministic polish');
    return {
      markdown: base,
      changed: beforeHash !== baseHash,
      method: 'deterministic',
    };
  }
}

/** Short human summary of each step for agent prompts. */
export function buildPolishedStepBrief(
  steps: Array<{ stepKey: string; label: string }>,
): string {
  return steps
    .map((s, i) => {
      const polished = polishWorkflowMarkdownDeterministic(`- [ ] ${s.label}`)
        .replace(/^-\s+\[[ xX]\]\s+/i, '')
        .trim();
      return `${i + 1}. [${s.stepKey}] ${polished}`;
    })
    .join('\n');
}
