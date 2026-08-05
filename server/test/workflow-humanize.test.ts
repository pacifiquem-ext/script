import { describe, expect, it } from 'vitest';
import { humanizeToolCall, humanizeToolResult } from '../src/modules/workflows/humanize-activity';
import { polishWorkflowMarkdownDeterministic } from '../src/modules/workflows/polish-workflow';

describe('humanize activity logs', () => {
  it('turns browser_navigate into plain language', () => {
    const h = humanizeToolCall('browser_navigate', { url: 'https://Github.com' });
    expect(h.message.toLowerCase()).toContain('opening');
    expect(h.message.toLowerCase()).toContain('github.com');
    expect(h.message).not.toContain('browser_navigate');
    expect(h.message).not.toContain('{');
  });

  it('humanizes click by visible text', () => {
    const h = humanizeToolCall('browser_click', { text: 'Sign in' });
    expect(h.message).toMatch(/clicking/i);
    expect(h.message).toContain('Sign in');
  });

  it('humanizes failed results without raw json as the title', () => {
    const h = humanizeToolResult('browser_navigate', false, 'Page looks like a 404');
    expect(h.message.toLowerCase()).not.toContain('browser_navigate');
    expect(h.detail).toMatch(/404/);
  });
});

describe('polish workflow markdown', () => {
  it('adds https and cleans checklist wording', () => {
    const md = `# Onboarding

## Start
- [ ] Go to Github.com
- [ ] Find PRs in in repo: https://example.com/x
`;
    const out = polishWorkflowMarkdownDeterministic(md);
    expect(out).toMatch(/Go to https:\/\/github\.com/i);
    expect(out).toMatch(/in repo/i);
    expect(out).not.toMatch(/in in/i);
  });
});
