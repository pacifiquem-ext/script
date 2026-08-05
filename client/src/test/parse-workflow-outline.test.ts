import { describe, expect, it } from 'vitest';
import { parseWorkflowOutline } from '../lib/parse-workflow-outline';

describe('parseWorkflowOutline', () => {
  it('extracts title, sections, and checklist steps', () => {
    const md = `# Onboarding

Welcome text.

## Week 1
- [ ] Set up laptop
- [x] Read handbook
- not a step

## Week 2
- [ ] Meet your manager
`;
    const outline = parseWorkflowOutline(md);
    expect(outline.title).toBe('Onboarding');
    expect(outline.steps).toHaveLength(3);
    expect(outline.steps.map((s) => s.label)).toEqual([
      'Set up laptop',
      'Read handbook',
      'Meet your manager',
    ]);
    expect(outline.steps[1]?.defaultDone).toBe(true);
    expect(outline.sections).toHaveLength(2);
    expect(outline.sections[0]?.heading).toBe('Week 1');
    expect(outline.sections[0]?.steps).toHaveLength(2);
    expect(outline.sections[1]?.heading).toBe('Week 2');
    expect(outline.steps[0]?.index).toBe(0);
    expect(outline.steps[2]?.index).toBe(2);
  });

  it('defaults title when no H1', () => {
    const outline = parseWorkflowOutline('- [ ] Only step\n');
    expect(outline.title).toBe('Untitled workflow');
    expect(outline.steps).toHaveLength(1);
  });

  it('ignores empty checkbox labels', () => {
    const outline = parseWorkflowOutline('# T\n- [ ] \n- [ ] Real\n');
    expect(outline.steps).toHaveLength(1);
    expect(outline.steps[0]?.label).toBe('Real');
  });
});
