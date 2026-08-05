import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  normalizeStepLabel,
  parseWorkflowMarkdown,
} from '../src/modules/workflows/parse-workflow-markdown';

function expectedKey(label: string): string {
  return createHash('sha256')
    .update(normalizeStepLabel(label))
    .digest('hex')
    .slice(0, 16);
}

describe('parseWorkflowMarkdown', () => {
  it('extracts title, sections, and checklist steps', () => {
    const md = `# Onboarding

Welcome to the team.

## Day 1
- [ ] Set up laptop
- [x] Read handbook
- plain guidance bullet

## Day 2
- [ ] Meet your manager
`;
    const parsed = parseWorkflowMarkdown(md);
    expect(parsed.title).toBe('Onboarding');
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]?.heading).toBe('Day 1');
    expect(parsed.sections[0]?.steps).toHaveLength(2);
    expect(parsed.sections[1]?.heading).toBe('Day 2');
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.steps[0]).toMatchObject({
      label: 'Set up laptop',
      defaultDone: false,
      stepKey: expectedKey('Set up laptop'),
    });
    expect(parsed.steps[1]).toMatchObject({
      label: 'Read handbook',
      defaultDone: true,
      stepKey: expectedKey('Read handbook'),
    });
    expect(parsed.steps[2]?.label).toBe('Meet your manager');
  });

  it('suffixes collision keys for duplicate labels', () => {
    const md = `# Dupes
- [ ] Same step
- [ ] Same step
- [ ] Same step
`;
    const parsed = parseWorkflowMarkdown(md);
    const base = expectedKey('Same step');
    expect(parsed.steps.map((s) => s.stepKey)).toEqual([base, `${base}#2`, `${base}#3`]);
  });

  it('normalizes whitespace for step keys', () => {
    const a = parseWorkflowMarkdown('# T\n- [ ] Hello   World\n');
    const b = parseWorkflowMarkdown('# T\n- [ ] hello world\n');
    expect(a.steps[0]?.stepKey).toBe(b.steps[0]?.stepKey);
  });

  it('defaults title when no H1', () => {
    const parsed = parseWorkflowMarkdown('## Only section\n- [ ] One\n');
    expect(parsed.title).toBe('Untitled workflow');
    expect(parsed.steps).toHaveLength(1);
  });
});
