import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export type ExecutionLogKind =
  | 'status'
  | 'phase'
  | 'reasoning'
  | 'tool'
  | 'tool_result'
  | 'step'
  | 'step_failed'
  | 'error'
  | 'done';

export type ExecutionLogEntry = {
  id: string;
  at: string;
  kind: ExecutionLogKind;
  message: string;
  detail?: string;
  toolName?: string;
  ok?: boolean;
  stepKey?: string;
};

const MAX_LOG = 250;

function newId(): string {
  return `elog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function redactSecrets(text: string): string {
  return text
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, 'ghp_••••••••')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, 'github_pat_••••••••')
    .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, 'sk-••••••••')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, 'xox•-••••••••');
}

export function makeLogEntry(
  kind: ExecutionLogKind,
  message: string,
  extra?: Partial<Omit<ExecutionLogEntry, 'id' | 'at' | 'kind' | 'message'>>,
): ExecutionLogEntry {
  return {
    id: newId(),
    at: new Date().toISOString(),
    kind,
    message: redactSecrets(message).slice(0, 2000),
    ...extra,
    detail: extra?.detail ? redactSecrets(extra.detail).slice(0, 4000) : undefined,
  };
}

export function parseExecutionLog(raw: unknown): ExecutionLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ExecutionLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Partial<ExecutionLogEntry>;
    if (typeof o.message !== 'string' || typeof o.kind !== 'string') continue;
    out.push({
      id: typeof o.id === 'string' ? o.id : newId(),
      at: typeof o.at === 'string' ? o.at : new Date().toISOString(),
      kind: o.kind as ExecutionLogKind,
      message: o.message,
      detail: typeof o.detail === 'string' ? o.detail : undefined,
      toolName: typeof o.toolName === 'string' ? o.toolName : undefined,
      ok: typeof o.ok === 'boolean' ? o.ok : undefined,
      stepKey: typeof o.stepKey === 'string' ? o.stepKey : undefined,
    });
  }
  return out;
}

export async function setAgentRunning(runId: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      agentStatus: 'running',
      agentSummary: 'Agent is executing steps…',
    },
  });
}

export async function appendExecutionLog(
  runId: string,
  entry: ExecutionLogEntry,
  opts?: { agentStatus?: string; agentSummary?: string },
): Promise<ExecutionLogEntry[]> {
  const row = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: { executionLogJson: true },
  });
  const prev = parseExecutionLog(row?.executionLogJson);
  const next = [...prev, entry].slice(-MAX_LOG);
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      executionLogJson: next as unknown as Prisma.InputJsonValue,
      ...(opts?.agentStatus ? { agentStatus: opts.agentStatus } : {}),
      ...(opts?.agentSummary !== undefined ? { agentSummary: opts.agentSummary } : {}),
    },
  });
  return next;
}

export async function flushReasoningLog(
  runId: string,
  text: string,
): Promise<ExecutionLogEntry | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const entry = makeLogEntry('reasoning', trimmed.slice(0, 1500), {
    detail: trimmed.length > 1500 ? `${trimmed.slice(0, 1500)}…` : undefined,
  });
  await appendExecutionLog(runId, entry);
  return entry;
}
