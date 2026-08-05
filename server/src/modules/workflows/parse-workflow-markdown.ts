import { createHash } from 'node:crypto';

export type ParsedWorkflowStep = {
  stepKey: string;
  label: string;
  defaultDone: boolean;
};

export type ParsedWorkflowSection = {
  heading: string;
  steps: ParsedWorkflowStep[];
};

export type ParsedWorkflow = {
  title: string;
  sections: ParsedWorkflowSection[];
  steps: ParsedWorkflowStep[];
};

const CHECKLIST_RE = /^-\s+\[([ xX])\]\s+(.+?)\s*$/;
const H1_RE = /^#\s+(.+?)\s*$/;
const H2_RE = /^##\s+(.+?)\s*$/;

export function normalizeStepLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashStepKey(normalizedLabel: string): string {
  return createHash('sha256').update(normalizedLabel).digest('hex').slice(0, 16);
}

/**
 * Parse markdown into title, ## sections, and tracked checklist steps.
 * stepKey = first 16 hex of sha256(normalized label); collisions get #2, #3 suffixes.
 */
export function parseWorkflowMarkdown(markdown: string): ParsedWorkflow {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let title = 'Untitled workflow';
  let titleFound = false;

  type MutableSection = { heading: string; steps: ParsedWorkflowStep[] };
  const sections: MutableSection[] = [];
  let current: MutableSection = { heading: '', steps: [] };
  sections.push(current);

  const usedKeys = new Map<string, number>();

  function allocateKey(label: string): string {
    const base = hashStepKey(normalizeStepLabel(label));
    const n = (usedKeys.get(base) ?? 0) + 1;
    usedKeys.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!titleFound) {
      const h1 = H1_RE.exec(line.trim());
      if (h1?.[1]) {
        title = h1[1].trim() || title;
        titleFound = true;
        continue;
      }
    }

    const h2 = H2_RE.exec(line.trim());
    if (h2?.[1]) {
      const heading = h2[1].trim();
      if (current.steps.length === 0 && current.heading === '') {
        current.heading = heading;
      } else {
        current = { heading, steps: [] };
        sections.push(current);
      }
      continue;
    }

    const check = CHECKLIST_RE.exec(line.trim());
    if (check) {
      const mark = check[1] ?? ' ';
      const label = (check[2] ?? '').trim();
      if (!label) continue;
      const defaultDone = mark.toLowerCase() === 'x';
      const step: ParsedWorkflowStep = {
        stepKey: allocateKey(label),
        label,
        defaultDone,
      };
      current.steps.push(step);
    }
  }

  const nonEmptySections = sections.filter((s) => s.steps.length > 0 || s.heading !== '');
  const finalSections =
    nonEmptySections.length > 0
      ? nonEmptySections.filter((s) => s.steps.length > 0 || s.heading !== '')
      : [{ heading: '', steps: [] as ParsedWorkflowStep[] }];

  // Drop a single empty placeholder if we never saw structure
  const cleaned =
    finalSections.length === 1 &&
    finalSections[0]!.heading === '' &&
    finalSections[0]!.steps.length === 0
      ? []
      : finalSections.filter((s) => s.steps.length > 0 || s.heading !== '');

  const steps = cleaned.flatMap((s) => s.steps);
  return {
    title,
    sections: cleaned,
    steps,
  };
}
