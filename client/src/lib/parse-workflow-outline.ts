/**
 * Lightweight client-side outline of workflow markdown for the author UI.
 * Mirrors server grammar enough for display (# title, ## sections, - [ ] / - [x] steps).
 * Does not compute server stepKeys — use run.stepKey when completing.
 */

export type WorkflowOutlineStep = {
  index: number;
  label: string;
  defaultDone: boolean;
};

export type WorkflowOutlineSection = {
  heading: string;
  steps: WorkflowOutlineStep[];
};

export type WorkflowOutline = {
  title: string;
  sections: WorkflowOutlineSection[];
  steps: WorkflowOutlineStep[];
};

const CHECKLIST_RE = /^-\s+\[([ xX])\]\s+(.+?)\s*$/;
const H1_RE = /^#\s+(.+?)\s*$/;
const H2_RE = /^##\s+(.+?)\s*$/;

export function parseWorkflowOutline(markdown: string): WorkflowOutline {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let title = 'Untitled workflow';
  let titleFound = false;

  type MutableSection = { heading: string; steps: WorkflowOutlineStep[] };
  const sections: MutableSection[] = [];
  let current: MutableSection = { heading: '', steps: [] };
  sections.push(current);

  let stepIndex = 0;

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
      const step: WorkflowOutlineStep = {
        index: stepIndex,
        label,
        defaultDone: mark.toLowerCase() === 'x',
      };
      stepIndex += 1;
      current.steps.push(step);
    }
  }

  const cleaned = sections.filter((s) => s.steps.length > 0 || s.heading !== '');
  const finalSections =
    cleaned.length === 1 && cleaned[0]!.heading === '' && cleaned[0]!.steps.length === 0
      ? []
      : cleaned.filter((s) => s.steps.length > 0 || s.heading !== '');

  return {
    title,
    sections: finalSections,
    steps: finalSections.flatMap((s) => s.steps),
  };
}
