import { COOKIE_WORKSPACE_ID, WORKSPACE_HEADER } from '@script/shared';
import { apiRequest, getApiBaseUrl } from './api-client';

export type WorkflowStatus = 'draft' | 'published';
export type WorkflowRunStatus = 'pending' | 'in_progress' | 'completed';
export type WorkflowStepStatus = 'pending' | 'done' | 'skipped';

export type StepEvidence = {
  method: 'agent_browser' | 'agent_tool' | 'manual' | 'self_attest' | 'connector';
  summary: string;
  finalUrl?: string;
  actions?: string[];
};

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

export type WorkflowStep = {
  stepKey: string;
  label: string;
  defaultDone: boolean;
};

export type WorkflowSection = {
  heading: string;
  steps: WorkflowStep[];
};

export type PublicWorkflowListItem = {
  id: string;
  name: string;
  status: WorkflowStatus;
  currentVersionId: string | null;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PublicWorkflowDetail = {
  id: string;
  name: string;
  status: WorkflowStatus;
  currentVersionId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  canPublish: boolean;
  version: {
    id: string;
    versionNumber: number;
    markdown: string;
    title: string;
    steps: WorkflowStep[];
    sections: WorkflowSection[];
    createdAt: string;
    verifiedAt: string | null;
    verifiedRunId: string | null;
  } | null;
};

export type PublicWorkflowRun = {
  id: string;
  workflowId: string;
  workflowVersionId: string;
  workflowName: string;
  assigneeUserId: string;
  status: WorkflowRunStatus;
  agentStatus: string;
  agentSummary: string | null;
  executionLog: ExecutionLogEntry[];
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: Array<{
    id: string;
    stepKey: string;
    label: string;
    status: WorkflowStepStatus;
    completedAt: string | null;
    completedById: string | null;
    evidence: StepEvidence | null;
  }>;
  progress: { total: number; done: number; pending: number; skipped: number };
  markdown: string;
  versionNumber: number;
};

export type WorkflowExecuteEvent =
  | { type: 'status'; message: string; log?: ExecutionLogEntry }
  | { type: 'phase'; message: string; log?: ExecutionLogEntry }
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string; log?: ExecutionLogEntry }
  | {
      type: 'tool_call';
      name: string;
      input: unknown;
      statusLabel: string;
      log?: ExecutionLogEntry;
    }
  | {
      type: 'tool_result';
      name: string;
      ok: boolean;
      detail?: string;
      log?: ExecutionLogEntry;
    }
  | {
      type: 'step_completed';
      stepKey: string;
      label: string;
      evidence?: StepEvidence | null;
      log?: ExecutionLogEntry;
    }
  | {
      type: 'step_failed';
      stepKey: string;
      label: string;
      reason: string;
      log?: ExecutionLogEntry;
    }
  | { type: 'done'; run: PublicWorkflowRun; log?: ExecutionLogEntry }
  | { type: 'error'; code: string; message: string; log?: ExecutionLogEntry };

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function listWorkflows() {
  return apiRequest<{ workflows: PublicWorkflowListItem[] }>('/workflows');
}

export function createWorkflow(body?: { name?: string; markdown?: string }) {
  return apiRequest<PublicWorkflowDetail>('/workflows', {
    method: 'POST',
    body: body ?? {},
  });
}

export function getWorkflow(id: string) {
  return apiRequest<PublicWorkflowDetail>(`/workflows/${id}`);
}

export function updateWorkflow(id: string, markdown: string) {
  return apiRequest<PublicWorkflowDetail>(`/workflows/${id}`, {
    method: 'PUT',
    body: { markdown },
  });
}

export function publishWorkflow(id: string) {
  return apiRequest<PublicWorkflowDetail>(`/workflows/${id}/publish`, {
    method: 'POST',
    body: {},
  });
}

/** Polish draft instructions + start a verification run (admin). Stream execute next. */
export function verifyWorkflow(id: string) {
  return apiRequest<{
    workflow: PublicWorkflowDetail;
    run: PublicWorkflowRun;
    polished: boolean;
    polishMethod: 'deterministic' | 'llm';
  }>(`/workflows/${id}/verify`, {
    method: 'POST',
    body: {},
  });
}

export function markWorkflowVerified(id: string, runId: string) {
  return apiRequest<PublicWorkflowDetail>(`/workflows/${id}/verified`, {
    method: 'POST',
    body: { runId },
  });
}

export function startWorkflowRun(workflowId: string) {
  return apiRequest<PublicWorkflowRun>(`/workflows/${workflowId}/runs`, {
    method: 'POST',
    body: {},
  });
}

export function listMyWorkflowRuns() {
  return apiRequest<{ runs: PublicWorkflowRun[] }>('/workflows/runs/mine');
}

export function getWorkflowRun(runId: string) {
  return apiRequest<PublicWorkflowRun>(`/workflows/runs/${runId}`);
}

export type PublicBrowserSession = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export function listBrowserSessions() {
  return apiRequest<{ sessions: PublicBrowserSession[] }>('/workflows/browser-sessions');
}

export function createBrowserSession(body: { name: string; storageState: unknown }) {
  return apiRequest<PublicBrowserSession>('/workflows/browser-sessions', {
    method: 'POST',
    body,
  });
}

export function deleteBrowserSession(id: string) {
  return apiRequest<{ ok: true }>(`/workflows/browser-sessions/${id}`, {
    method: 'DELETE',
  });
}

export function confirmWriteConfirmation(confirmationId: string) {
  return apiRequest<PublicWorkflowRun>(
    `/workflows/write-confirmations/${encodeURIComponent(confirmationId)}/confirm`,
    { method: 'POST', body: {} },
  );
}

export function rejectWriteConfirmation(confirmationId: string) {
  return apiRequest<{ ok: true }>(
    `/workflows/write-confirmations/${encodeURIComponent(confirmationId)}/reject`,
    { method: 'POST', body: {} },
  );
}

export function completeWorkflowStep(
  runId: string,
  stepKey: string,
  body?: {
    asAdmin?: boolean;
    source?: 'ui' | 'agent' | 'agent_browser';
    evidence?: StepEvidence;
  },
) {
  return apiRequest<PublicWorkflowRun>(
    `/workflows/runs/${runId}/steps/${encodeURIComponent(stepKey)}/complete`,
    {
      method: 'POST',
      body: body ?? {
        source: 'ui',
        evidence: {
          method: 'manual',
          summary: 'Marked complete by assignee in the runner UI',
        },
      },
    },
  );
}

/**
 * Stream agent execution of a run (Playwright browser tools + evidence-backed complete).
 * Yields SSE events until done/error.
 */
export async function* executeWorkflowRunStream(
  runId: string,
  opts?: { signal?: AbortSignal; browserSessionId?: string },
): AsyncGenerator<WorkflowExecuteEvent> {
  const baseUrl = getApiBaseUrl();
  const headers = new Headers({
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  });
  const workspaceId = readCookie(COOKIE_WORKSPACE_ID);
  if (workspaceId) headers.set(WORKSPACE_HEADER, workspaceId);

  const response = await fetch(`${baseUrl}/workflows/runs/${runId}/execute`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(
      opts?.browserSessionId ? { browserSessionId: opts.browserSessionId } : {},
    ),
    signal: opts?.signal,
  });

  if (!response.ok) {
    let message = response.statusText || 'Execute failed';
    try {
      const json = (await response.json()) as { error?: { message?: string } };
      if (json.error?.message) message = json.error.message;
    } catch {
      // ignore
    }
    yield { type: 'error', code: 'HTTP_ERROR', message };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', code: 'STREAM_ERROR', message: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('data:'));
      if (!line) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        yield JSON.parse(json) as WorkflowExecuteEvent;
      } catch {
        // skip malformed chunk
      }
    }
  }
}
