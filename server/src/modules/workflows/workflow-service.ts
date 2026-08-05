import type { Prisma, WorkflowRunStatus, WorkflowStatus, WorkspaceRole } from '@prisma/client';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import { setMemoryChunkEmbedding } from '../../db/vector';
import { logger } from '../../lib/logger';
import { recordAudit } from '../audit/audit-service';
import { chunkText } from '../jobs/extract';
import { embedTexts } from '../jobs/embeddings';
import { assertLicenseAllowsWrite } from '../license/license-service';
import {
  parseWorkflowMarkdown,
  type ParsedWorkflow,
  type ParsedWorkflowStep,
} from './parse-workflow-markdown';

export type WorkflowStepsJson = {
  title: string;
  sections: ParsedWorkflow['sections'];
  steps: ParsedWorkflowStep[];
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
    steps: ParsedWorkflowStep[];
    sections: ParsedWorkflow['sections'];
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
    status: 'pending' | 'done' | 'skipped';
    completedAt: string | null;
    completedById: string | null;
  }>;
  progress: { total: number; done: number; pending: number; skipped: number };
  /** Pinned WorkflowVersion markdown (guidance for the runner). */
  markdown: string;
  versionNumber: number;
};

function stepsJsonFromParsed(parsed: ParsedWorkflow): WorkflowStepsJson {
  return {
    title: parsed.title,
    sections: parsed.sections,
    steps: parsed.steps,
  };
}

function parseStepsJson(raw: unknown): WorkflowStepsJson {
  if (!raw || typeof raw !== 'object') {
    return { title: '', sections: [], steps: [] };
  }
  const o = raw as Partial<WorkflowStepsJson>;
  return {
    title: typeof o.title === 'string' ? o.title : '',
    sections: Array.isArray(o.sections) ? o.sections : [],
    steps: Array.isArray(o.steps) ? o.steps : [],
  };
}

function isAdminRole(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}

function progressFromSteps(
  steps: Array<{ status: string }>,
): PublicWorkflowRun['progress'] {
  let done = 0;
  let pending = 0;
  let skipped = 0;
  for (const s of steps) {
    if (s.status === 'done') done += 1;
    else if (s.status === 'skipped') skipped += 1;
    else pending += 1;
  }
  return { total: steps.length, done, pending, skipped };
}

function mapRun(
  row: {
    id: string;
    workflowId: string;
    workflowVersionId: string;
    assigneeUserId: string;
    status: WorkflowRunStatus;
    startedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    workflow?: { name: string } | null;
    workflowVersion?: { markdown: string; versionNumber: number } | null;
    steps: Array<{
      id: string;
      stepKey: string;
      label: string;
      status: 'pending' | 'done' | 'skipped';
      completedAt: Date | null;
      completedById: string | null;
    }>;
  },
  workflowName?: string,
): PublicWorkflowRun {
  const name = workflowName ?? row.workflow?.name ?? '';
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowVersionId: row.workflowVersionId,
    workflowName: name,
    assigneeUserId: row.assigneeUserId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    steps: row.steps.map((s) => ({
      id: s.id,
      stepKey: s.stepKey,
      label: s.label,
      status: s.status,
      completedAt: s.completedAt?.toISOString() ?? null,
      completedById: s.completedById,
    })),
    progress: progressFromSteps(row.steps),
    markdown: row.workflowVersion?.markdown ?? '',
    versionNumber: row.workflowVersion?.versionNumber ?? 0,
  };
}

const runInclude = {
  steps: true as const,
  workflow: { select: { name: true } },
  workflowVersion: { select: { markdown: true, versionNumber: true, stepsJson: true } },
};

async function loadWorkflowOrThrow(workspaceId: string, workflowId: string) {
  const wf = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId },
    include: { currentVersion: true },
  });
  if (!wf) throw new NotFoundError('Workflow');
  return wf;
}

function assertCanReadWorkflow(
  status: WorkflowStatus,
  role: WorkspaceRole,
): void {
  if (status === 'draft' && !isAdminRole(role)) {
    throw new ForbiddenError('Draft workflows are only visible to workspace admins');
  }
}

export async function listWorkflows(
  workspaceId: string,
  role: WorkspaceRole,
): Promise<{ workflows: PublicWorkflowListItem[] }> {
  const where = isAdminRole(role)
    ? { workspaceId }
    : { workspaceId, status: 'published' as const };

  const rows = await prisma.workflow.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { currentVersion: { select: { stepsJson: true } } },
  });

  return {
    workflows: rows.map((r) => {
      const steps = parseStepsJson(r.currentVersion?.stepsJson).steps;
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        currentVersionId: r.currentVersionId,
        stepCount: steps.length,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    }),
  };
}

export async function getWorkflow(
  workspaceId: string,
  workflowId: string,
  role: WorkspaceRole,
): Promise<PublicWorkflowDetail> {
  const wf = await loadWorkflowOrThrow(workspaceId, workflowId);
  assertCanReadWorkflow(wf.status, role);
  const version = wf.currentVersion;
  const parsed = version ? parseStepsJson(version.stepsJson) : null;
  return {
    id: wf.id,
    name: wf.name,
    status: wf.status,
    currentVersionId: wf.currentVersionId,
    createdById: wf.createdById,
    createdAt: wf.createdAt.toISOString(),
    updatedAt: wf.updatedAt.toISOString(),
    version: version
      ? {
          id: version.id,
          versionNumber: version.versionNumber,
          markdown: version.markdown,
          title: version.title,
          steps: parsed?.steps ?? [],
          sections: parsed?.sections ?? [],
          createdAt: version.createdAt.toISOString(),
        }
      : null,
  };
}

export async function createWorkflow(
  workspaceId: string,
  userId: string,
  input: { name?: string; markdown?: string },
): Promise<PublicWorkflowDetail> {
  await assertLicenseAllowsWrite();
  const markdown = input.markdown?.trim() ? input.markdown : '# Untitled workflow\n';
  const parsed = parseWorkflowMarkdown(markdown);
  const name = (input.name?.trim() || parsed.title || 'Untitled workflow').slice(0, 200);

  const wf = await prisma.$transaction(async (tx) => {
    const created = await tx.workflow.create({
      data: {
        workspaceId,
        name,
        status: 'draft',
        createdById: userId,
      },
    });
    const version = await tx.workflowVersion.create({
      data: {
        workspaceId,
        workflowId: created.id,
        versionNumber: 1,
        markdown,
        title: parsed.title,
        stepsJson: stepsJsonFromParsed(parsed) as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
    return tx.workflow.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
      include: { currentVersion: true },
    });
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'workflow.create',
    targetType: 'workflow',
    targetId: wf.id,
    metadata: { name: wf.name },
  });

  return getWorkflow(workspaceId, wf.id, 'admin');
}

export async function updateDraftMarkdown(
  workspaceId: string,
  userId: string,
  workflowId: string,
  markdown: string,
): Promise<PublicWorkflowDetail> {
  await assertLicenseAllowsWrite();
  if (typeof markdown !== 'string') throw new BadRequestError('markdown is required');
  const wf = await loadWorkflowOrThrow(workspaceId, workflowId);
  const parsed = parseWorkflowMarkdown(markdown);
  const name = (parsed.title || wf.name).slice(0, 200);
  const stepsJson = stepsJsonFromParsed(parsed) as unknown as Prisma.InputJsonValue;

  if (wf.status === 'draft' && wf.currentVersionId) {
    await prisma.$transaction(async (tx) => {
      await tx.workflowVersion.update({
        where: { id: wf.currentVersionId! },
        data: {
          markdown,
          title: parsed.title,
          stepsJson,
        },
      });
      await tx.workflow.update({
        where: { id: wf.id },
        data: { name },
      });
    });
  } else {
    const latest = await prisma.workflowVersion.findFirst({
      where: { workflowId: wf.id },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextNum = (latest?.versionNumber ?? 0) + 1;
    await prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.create({
        data: {
          workspaceId,
          workflowId: wf.id,
          versionNumber: nextNum,
          markdown,
          title: parsed.title,
          stepsJson,
          createdById: userId,
        },
      });
      await tx.workflow.update({
        where: { id: wf.id },
        data: {
          name,
          currentVersionId: version.id,
          // stay published if already published; draft stays draft
        },
      });
    });
    if (wf.status === 'published') {
      void embedPublishedWorkflow(workspaceId, workflowId).catch((err) =>
        logger.warn({ err, workflowId }, 'workflow embed after version save failed'),
      );
    }
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'workflow.update',
    targetType: 'workflow',
    targetId: workflowId,
  });

  return getWorkflow(workspaceId, workflowId, 'admin');
}

export async function publishWorkflow(
  workspaceId: string,
  userId: string,
  workflowId: string,
): Promise<PublicWorkflowDetail> {
  await assertLicenseAllowsWrite();
  const wf = await loadWorkflowOrThrow(workspaceId, workflowId);
  if (!wf.currentVersionId || !wf.currentVersion) {
    throw new BadRequestError('Workflow has no version to publish');
  }
  const parsed = parseStepsJson(wf.currentVersion.stepsJson);
  if (parsed.steps.length === 0) {
    throw new BadRequestError('Publish requires at least one checklist step (- [ ] …)');
  }

  await prisma.workflow.update({
    where: { id: wf.id },
    data: {
      status: 'published',
      name: (wf.currentVersion.title || wf.name).slice(0, 200),
    },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'workflow.publish',
    targetType: 'workflow',
    targetId: workflowId,
    metadata: { versionId: wf.currentVersionId },
  });

  void embedPublishedWorkflow(workspaceId, workflowId).catch((err) =>
    logger.warn({ err, workflowId }, 'workflow embed on publish failed'),
  );

  return getWorkflow(workspaceId, workflowId, 'admin');
}

export async function startRun(
  workspaceId: string,
  userId: string,
  workflowId: string,
): Promise<PublicWorkflowRun> {
  await assertLicenseAllowsWrite();
  const wf = await loadWorkflowOrThrow(workspaceId, workflowId);
  if (wf.status !== 'published' || !wf.currentVersion) {
    throw new BadRequestError('Only published workflows can be started');
  }
  const parsed = parseStepsJson(wf.currentVersion.stepsJson);
  if (parsed.steps.length === 0) {
    throw new BadRequestError('Workflow has no steps');
  }

  const now = new Date();
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.workflowRun.create({
      data: {
        workspaceId,
        workflowId: wf.id,
        workflowVersionId: wf.currentVersion!.id,
        assigneeUserId: userId,
        status: 'in_progress',
        startedAt: now,
      },
    });
    await tx.workflowStepState.createMany({
      data: parsed.steps.map((step) => ({
        workspaceId,
        runId: created.id,
        stepKey: step.stepKey,
        label: step.label,
        status: step.defaultDone ? ('done' as const) : ('pending' as const),
        completedAt: step.defaultDone ? now : null,
        completedById: step.defaultDone ? userId : null,
      })),
    });
    return tx.workflowRun.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        steps: { orderBy: { createdAt: 'asc' } },
        workflow: { select: { name: true } },
        workflowVersion: { select: { markdown: true, versionNumber: true, stepsJson: true } },
      },
    });
  });

  // Re-order steps to match stepsJson order
  const order = new Map(parsed.steps.map((s, i) => [s.stepKey, i]));
  run.steps.sort((a, b) => (order.get(a.stepKey) ?? 0) - (order.get(b.stepKey) ?? 0));

  // If all defaultDone, mark completed
  if (run.steps.every((s) => s.status === 'done' || s.status === 'skipped')) {
    const completed = await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: 'completed', completedAt: now },
      include: runInclude,
    });
    completed.steps.sort((a, b) => (order.get(a.stepKey) ?? 0) - (order.get(b.stepKey) ?? 0));
    return mapRun(completed);
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'workflow.run.start',
    targetType: 'workflow_run',
    targetId: run.id,
    metadata: { workflowId },
  });

  return mapRun(run);
}

export async function getRun(
  workspaceId: string,
  userId: string,
  runId: string,
  role: WorkspaceRole,
): Promise<PublicWorkflowRun> {
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, workspaceId },
    include: runInclude,
  });
  if (!run) throw new NotFoundError('Workflow run');
  if (run.assigneeUserId !== userId && !isAdminRole(role)) {
    throw new ForbiddenError('Not allowed to view this run');
  }
  const order = new Map(
    parseStepsJson(run.workflowVersion.stepsJson).steps.map((s, i) => [s.stepKey, i]),
  );
  run.steps.sort((a, b) => (order.get(a.stepKey) ?? 0) - (order.get(b.stepKey) ?? 0));
  return mapRun(run);
}

export async function listMyRuns(
  workspaceId: string,
  userId: string,
): Promise<{ runs: PublicWorkflowRun[] }> {
  const rows = await prisma.workflowRun.findMany({
    where: { workspaceId, assigneeUserId: userId },
    orderBy: { updatedAt: 'desc' },
    include: runInclude,
  });
  return {
    runs: rows.map((run) => {
      const order = new Map(
        parseStepsJson(run.workflowVersion.stepsJson).steps.map((s, i) => [s.stepKey, i]),
      );
      run.steps.sort((a, b) => (order.get(a.stepKey) ?? 0) - (order.get(b.stepKey) ?? 0));
      return mapRun(run);
    }),
  };
}

export async function completeStep(
  workspaceId: string,
  userId: string,
  runId: string,
  stepKey: string,
  opts: { asAdmin?: boolean; role: WorkspaceRole; source?: 'ui' | 'agent' } = {
    role: 'member',
  },
): Promise<PublicWorkflowRun> {
  await assertLicenseAllowsWrite();
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, workspaceId },
    include: runInclude,
  });
  if (!run) throw new NotFoundError('Workflow run');

  const isAssignee = run.assigneeUserId === userId;
  const adminOk = opts.asAdmin && isAdminRole(opts.role);
  if (!isAssignee && !adminOk && !isAdminRole(opts.role)) {
    throw new ForbiddenError('Only the run assignee or a workspace admin may complete a step');
  }

  const step = run.steps.find((s) => s.stepKey === stepKey);
  if (!step) throw new NotFoundError('Workflow step');
  if (step.status === 'done') {
    return getRun(workspaceId, userId, runId, opts.role);
  }

  const now = new Date();
  await prisma.workflowStepState.update({
    where: { id: step.id },
    data: {
      status: 'done',
      completedAt: now,
      completedById: userId,
    },
  });

  const remaining = await prisma.workflowStepState.count({
    where: { runId, status: 'pending' },
  });
  if (remaining === 0) {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'completed', completedAt: now },
    });
  } else if (run.status === 'pending') {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'in_progress' },
    });
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'workflow.step.complete',
    targetType: 'workflow_run',
    targetId: runId,
    metadata: {
      stepKey,
      source: opts.source ?? 'ui',
      asAdmin: Boolean(opts.asAdmin),
    },
  });

  return getRun(workspaceId, userId, runId, opts.role);
}

export async function getMyProgress(
  workspaceId: string,
  userId: string,
  workflowId?: string,
): Promise<{
  runs: PublicWorkflowRun[];
  nextSteps: Array<{ runId: string; workflowId: string; workflowName: string; stepKey: string; label: string }>;
}> {
  const where = {
    workspaceId,
    assigneeUserId: userId,
    ...(workflowId ? { workflowId } : {}),
    status: { in: ['pending', 'in_progress'] as WorkflowRunStatus[] },
  };
  const rows = await prisma.workflowRun.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: runInclude,
  });

  const runs = rows.map((run) => {
    const order = new Map(
      parseStepsJson(run.workflowVersion.stepsJson).steps.map((s, i) => [s.stepKey, i]),
    );
    run.steps.sort((a, b) => (order.get(a.stepKey) ?? 0) - (order.get(b.stepKey) ?? 0));
    return mapRun(run);
  });

  const nextSteps: Array<{
    runId: string;
    workflowId: string;
    workflowName: string;
    stepKey: string;
    label: string;
  }> = [];
  for (const run of runs) {
    const next = run.steps.find((s) => s.status === 'pending');
    if (next) {
      nextSteps.push({
        runId: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflowName,
        stepKey: next.stepKey,
        label: next.label,
      });
    }
  }

  return { runs, nextSteps };
}

/**
 * Upsert MemorySource (type workflow) + chunk/embed markdown for retrieval.
 * Best-effort: failures are logged; publish still succeeds.
 */
export async function embedPublishedWorkflow(
  workspaceId: string,
  workflowId: string,
): Promise<void> {
  const wf = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId, status: 'published' },
    include: { currentVersion: true },
  });
  if (!wf?.currentVersion) return;

  const title = wf.currentVersion.title || wf.name;
  const markdown = wf.currentVersion.markdown;
  const externalKey = workflowId;

  let memorySource = await prisma.memorySource.findFirst({
    where: { workspaceId, type: 'workflow', externalKey },
  });
  if (!memorySource) {
    memorySource = await prisma.memorySource.create({
      data: {
        workspaceId,
        type: 'workflow',
        title,
        externalKey,
      },
    });
  } else if (memorySource.title !== title) {
    memorySource = await prisma.memorySource.update({
      where: { id: memorySource.id },
      data: { title },
    });
  }

  const chunks = chunkText(markdown);
  if (chunks.length === 0) {
    await prisma.memoryChunk.deleteMany({ where: { memorySourceId: memorySource.id } });
    return;
  }

  let embeddings: number[][] = [];
  try {
    embeddings = await embedTexts(
      chunks.map((c) => c.content),
      'document',
    );
  } catch (err) {
    logger.warn({ err, workflowId }, 'workflow embedding failed; storing text chunks only');
  }

  await prisma.$transaction(async (tx) => {
    await tx.memoryChunk.deleteMany({ where: { memorySourceId: memorySource!.id } });
    await tx.memoryChunk.createMany({
      data: chunks.map((chunk, i) => ({
        memorySourceId: memorySource!.id,
        workspaceId,
        sourceType: 'workflow' as const,
        position: i,
        content: chunk.content,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        pageNumber: chunk.pageNumber,
      })),
    });
    if (embeddings.length === 0) return;
    const rows = await tx.memoryChunk.findMany({
      where: { memorySourceId: memorySource!.id },
      select: { id: true, position: true },
      orderBy: { position: 'asc' },
    });
    for (const row of rows) {
      const emb = embeddings[row.position];
      if (emb) await setMemoryChunkEmbedding(tx, row.id, emb);
    }
  });
}
