import { apiRequest } from './api-client';

export type WorkflowStatus = 'draft' | 'published';
export type WorkflowRunStatus = 'pending' | 'in_progress' | 'completed';
export type WorkflowStepStatus = 'pending' | 'done' | 'skipped';

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
  version: {
    id: string;
    versionNumber: number;
    markdown: string;
    title: string;
    steps: WorkflowStep[];
    sections: WorkflowSection[];
    createdAt: string;
  } | null;
};

export type PublicWorkflowRun = {
  id: string;
  workflowId: string;
  workflowVersionId: string;
  workflowName: string;
  assigneeUserId: string;
  status: WorkflowRunStatus;
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
  }>;
  progress: { total: number; done: number; pending: number; skipped: number };
  markdown: string;
  versionNumber: number;
};

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

export function completeWorkflowStep(
  runId: string,
  stepKey: string,
  body?: { asAdmin?: boolean; source?: 'ui' | 'agent' },
) {
  return apiRequest<PublicWorkflowRun>(
    `/workflows/runs/${runId}/steps/${encodeURIComponent(stepKey)}/complete`,
    {
      method: 'POST',
      body: body ?? { source: 'ui' },
    },
  );
}
