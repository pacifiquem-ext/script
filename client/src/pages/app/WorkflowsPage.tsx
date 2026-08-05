import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { MarkdownContent } from '../../components/ui/MarkdownContent';
import { useAuth } from '../../contexts/useAuth';
import { getErrorMessage } from '../../lib/form-errors';
import { IconCheck, IconPlus } from '../../lib/icons';
import { parseWorkflowOutline } from '../../lib/parse-workflow-outline';
import { useWorkspaces } from '../../lib/workspaces';
import {
  completeWorkflowStep,
  createWorkflow,
  getWorkflow,
  getWorkflowRun,
  listMyWorkflowRuns,
  listWorkflows,
  publishWorkflow,
  startWorkflowRun,
  updateWorkflow,
  type PublicWorkflowDetail,
  type PublicWorkflowListItem,
  type PublicWorkflowRun,
} from '../../lib/workflows-api';

type PanelMode = 'welcome' | 'edit' | 'run';

const DEFAULT_MARKDOWN = `# Untitled workflow

## Getting started
- [ ] First step
- [ ] Second step
`;

function isAdminRole(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

function progressLabel(run: PublicWorkflowRun): string {
  const { done, total } = run.progress;
  if (total === 0) return 'No steps';
  return `${done}/${total} done`;
}

function nextPendingStep(run: PublicWorkflowRun) {
  return run.steps.find((s) => s.status === 'pending') ?? null;
}

export function WorkflowsPage() {
  const { user } = useAuth();
  const workspacesQuery = useWorkspaces(Boolean(user));
  const activeWorkspace =
    workspacesQuery.data?.find((w) => w.id === user?.lastWorkspaceId) ??
    workspacesQuery.data?.[0] ??
    null;
  const canAuthor = isAdminRole(activeWorkspace?.role);

  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<PanelMode>('welcome');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<{
    runId: string;
    stepKey: string;
    label: string;
  } | null>(null);

  const listQuery = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const data = await listWorkflows();
      return data.workflows;
    },
  });

  const runsQuery = useQuery({
    queryKey: ['workflows', 'runs', 'mine'],
    queryFn: async () => {
      const data = await listMyWorkflowRuns();
      return data.runs;
    },
  });

  const detailQuery = useQuery({
    queryKey: ['workflows', selectedWorkflowId],
    enabled: Boolean(selectedWorkflowId) && panel === 'edit',
    queryFn: async () => getWorkflow(selectedWorkflowId!),
  });

  const runQuery = useQuery({
    queryKey: ['workflows', 'runs', selectedRunId],
    enabled: Boolean(selectedRunId) && panel === 'run',
    queryFn: async () => getWorkflowRun(selectedRunId!),
  });

  useEffect(() => {
    if (panel !== 'edit' || !detailQuery.data) return;
    if (dirty) return;
    setMarkdown(detailQuery.data.version?.markdown ?? DEFAULT_MARKDOWN);
  }, [detailQuery.data, panel, dirty]);

  const outline = useMemo(() => parseWorkflowOutline(markdown), [markdown]);

  const invalidateLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      createWorkflow({
        name: 'Untitled workflow',
        markdown: DEFAULT_MARKDOWN,
      }),
    onSuccess: async (wf) => {
      setError(null);
      setMessage('Draft created.');
      setDirty(false);
      setSelectedRunId(null);
      setSelectedWorkflowId(wf.id);
      setMarkdown(wf.version?.markdown ?? DEFAULT_MARKDOWN);
      setPanel('edit');
      await invalidateLists();
    },
    onError: (err) => setError(getErrorMessage(err, 'Could not create workflow')),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkflowId) throw new Error('No workflow selected');
      return updateWorkflow(selectedWorkflowId, markdown);
    },
    onSuccess: async (wf) => {
      setDirty(false);
      setMessage('Saved.');
      setMarkdown(wf.version?.markdown ?? markdown);
      await invalidateLists();
      await queryClient.invalidateQueries({ queryKey: ['workflows', selectedWorkflowId] });
    },
    onError: (err) => setError(getErrorMessage(err, 'Save failed')),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkflowId) throw new Error('No workflow selected');
      if (dirty) {
        await updateWorkflow(selectedWorkflowId, markdown);
      }
      return publishWorkflow(selectedWorkflowId);
    },
    onSuccess: async (wf) => {
      setPublishOpen(false);
      setDirty(false);
      setMessage('Published. Members can start a run.');
      setMarkdown(wf.version?.markdown ?? markdown);
      await invalidateLists();
      await queryClient.invalidateQueries({ queryKey: ['workflows', selectedWorkflowId] });
    },
    onError: (err) => {
      setPublishOpen(false);
      setError(getErrorMessage(err, 'Publish failed'));
    },
  });

  const startRunMutation = useMutation({
    mutationFn: async (workflowId: string) => startWorkflowRun(workflowId),
    onSuccess: async (run) => {
      setMessage('Run started.');
      setSelectedWorkflowId(run.workflowId);
      setSelectedRunId(run.id);
      setPanel('run');
      await queryClient.invalidateQueries({ queryKey: ['workflows', 'runs', 'mine'] });
      await queryClient.setQueryData(['workflows', 'runs', run.id], run);
    },
    onError: (err) => setError(getErrorMessage(err, 'Could not start run')),
  });

  const completeMutation = useMutation({
    mutationFn: async (target: { runId: string; stepKey: string }) =>
      completeWorkflowStep(target.runId, target.stepKey, { source: 'ui' }),
    onSuccess: async (run) => {
      setCompleteTarget(null);
      setMessage('Step marked complete.');
      await queryClient.setQueryData(['workflows', 'runs', run.id], run);
      await queryClient.invalidateQueries({ queryKey: ['workflows', 'runs', 'mine'] });
    },
    onError: (err) => {
      setCompleteTarget(null);
      setError(getErrorMessage(err, 'Could not complete step'));
    },
  });

  const openEdit = (id: string) => {
    setError(null);
    setDirty(false);
    setSelectedRunId(null);
    setSelectedWorkflowId(id);
    setPanel('edit');
  };

  const openRun = (runId: string) => {
    setError(null);
    setSelectedRunId(runId);
    setPanel('run');
  };

  const workflows = listQuery.data ?? [];
  const drafts = workflows.filter((w) => w.status === 'draft');
  const published = workflows.filter((w) => w.status === 'published');
  const myRuns = runsQuery.data ?? [];
  const activeRun = runQuery.data;
  const nextStep = activeRun ? nextPendingStep(activeRun) : null;

  return (
    <div className="flex h-full min-h-0 w-full bg-white">
      <aside className="w-[320px] shrink-0 border-r border-neutral-200 flex flex-col">
        <div className="p-4 flex flex-col gap-3 border-b border-neutral-100">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[16px] font-semibold text-neutral-950">Workflows</h1>
            {canAuthor && (
              <Button
                variant="primary"
                size="sm"
                className="w-fit"
                loading={createMutation.isPending}
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  createMutation.mutate();
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <IconPlus size={14} />
                  New
                </span>
              </Button>
            )}
          </div>
          <p className="text-[12px] text-neutral-500">
            Guided processes in markdown. Complete steps here, or ask the brain what&apos;s next in
            Chat.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {listQuery.isLoading && <LoadingState label="Loading workflows…" />}
          {listQuery.isError && (
            <ErrorState
              message={getErrorMessage(listQuery.error, 'Failed to load workflows')}
              onRetry={() => void listQuery.refetch()}
            />
          )}
          {!listQuery.isLoading && !listQuery.isError && workflows.length === 0 && (
            <EmptyState
              title="No workflows yet"
              description={
                canAuthor
                  ? 'Create a draft, add checklist steps (- [ ]), then publish.'
                  : 'When an admin publishes a workflow, it will show up here.'
              }
              action={
                canAuthor ? (
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-fit"
                    loading={createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                  >
                    Create workflow
                  </Button>
                ) : undefined
              }
            />
          )}

          {published.length > 0 && (
            <SectionLabel>Published</SectionLabel>
          )}
          {published.map((wf) => (
            <WorkflowListRow
              key={wf.id}
              workflow={wf}
              active={
                (panel === 'edit' && selectedWorkflowId === wf.id) ||
                (panel === 'run' && activeRun?.workflowId === wf.id)
              }
              onOpen={() => {
                if (canAuthor) openEdit(wf.id);
                else {
                  setSelectedWorkflowId(wf.id);
                  setPanel('welcome');
                }
              }}
              onStart={() => {
                setError(null);
                setMessage(null);
                startRunMutation.mutate(wf.id);
              }}
              startLoading={startRunMutation.isPending && startRunMutation.variables === wf.id}
            />
          ))}

          {canAuthor && drafts.length > 0 && (
            <>
              <SectionLabel>Drafts</SectionLabel>
              {drafts.map((wf) => (
                <WorkflowListRow
                  key={wf.id}
                  workflow={wf}
                  active={panel === 'edit' && selectedWorkflowId === wf.id}
                  onOpen={() => openEdit(wf.id)}
                />
              ))}
            </>
          )}

          <SectionLabel>My runs</SectionLabel>
          {runsQuery.isLoading && <p className="px-3 py-2 text-[12px] text-neutral-500">Loading…</p>}
          {!runsQuery.isLoading && myRuns.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-neutral-500">No runs yet.</p>
          )}
          {myRuns.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => openRun(run.id)}
              className={`w-full text-left rounded-10 px-3 py-2 mb-1 border-none cursor-pointer transition-colors ${
                panel === 'run' && selectedRunId === run.id
                  ? 'bg-primary-alpha-10'
                  : 'bg-transparent hover:bg-neutral-50'
              }`}
            >
              <p className="text-[13px] font-medium text-neutral-950 truncate">{run.workflowName}</p>
              <p className="text-[11px] text-neutral-500 capitalize">
                {run.status.replace('_', ' ')} · {progressLabel(run)}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto p-6">
        {(error || message) && (
          <div className="mb-4 max-w-4xl">
            {error && (
              <Alert
                status="error"
                variant="stroke"
                compact
                description={error}
                onDismiss={() => setError(null)}
              />
            )}
            {message && (
              <Alert
                status="success"
                variant="stroke"
                compact
                description={message}
                onDismiss={() => setMessage(null)}
              />
            )}
          </div>
        )}

        {panel === 'welcome' && (
          <WelcomePanel
            canAuthor={canAuthor}
            selectedWorkflowId={selectedWorkflowId}
            workflows={workflows}
            onCreate={() => createMutation.mutate()}
            createLoading={createMutation.isPending}
            onStart={(id) => {
              setError(null);
              startRunMutation.mutate(id);
            }}
            startLoading={startRunMutation.isPending}
            onEdit={openEdit}
          />
        )}

        {panel === 'edit' && (
          <AuthorPanel
            canAuthor={canAuthor}
            loading={detailQuery.isLoading}
            error={
              detailQuery.isError
                ? getErrorMessage(detailQuery.error, 'Failed to load workflow')
                : null
            }
            onRetry={() => void detailQuery.refetch()}
            workflow={detailQuery.data ?? null}
            markdown={markdown}
            outline={outline}
            dirty={dirty}
            onMarkdownChange={(value) => {
              setMarkdown(value);
              setDirty(true);
            }}
            onSave={() => {
              setError(null);
              setMessage(null);
              saveMutation.mutate();
            }}
            saveLoading={saveMutation.isPending}
            onPublish={() => {
              setError(null);
              setPublishOpen(true);
            }}
            publishLoading={publishMutation.isPending}
            onStartRun={() => {
              if (!selectedWorkflowId) return;
              setError(null);
              startRunMutation.mutate(selectedWorkflowId);
            }}
            startLoading={startRunMutation.isPending}
          />
        )}

        {panel === 'run' && (
          <RunnerPanel
            loading={runQuery.isLoading}
            error={
              runQuery.isError ? getErrorMessage(runQuery.error, 'Failed to load run') : null
            }
            onRetry={() => void runQuery.refetch()}
            run={activeRun ?? null}
            nextStep={nextStep}
            onCompleteStep={(step) => {
              setError(null);
              setCompleteTarget({
                runId: activeRun!.id,
                stepKey: step.stepKey,
                label: step.label,
              });
            }}
          />
        )}
      </main>

      <ConfirmModal
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish workflow?"
        description={
          outline.steps.length === 0
            ? 'Add at least one checklist step (- [ ] …) before publishing.'
            : `Publish “${outline.title}” with ${outline.steps.length} tracked step${outline.steps.length === 1 ? '' : 's'}? Members can start runs against this version.`
        }
        confirmLabel="Publish"
        loading={publishMutation.isPending}
        onConfirm={() => {
          if (outline.steps.length === 0) {
            setPublishOpen(false);
            setError('Publish requires at least one checklist step (- [ ] …)');
            return;
          }
          publishMutation.mutate();
        }}
      />

      <ConfirmModal
        open={Boolean(completeTarget)}
        onOpenChange={(open) => {
          if (!open) setCompleteTarget(null);
        }}
        title="Mark step complete?"
        description={
          completeTarget
            ? `Mark “${completeTarget.label}” as done? This is self-attestation for v1.`
            : undefined
        }
        confirmLabel="Complete step"
        loading={completeMutation.isPending}
        onConfirm={() => {
          if (!completeTarget) return;
          completeMutation.mutate(completeTarget);
        }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
      {children}
    </p>
  );
}

function WorkflowListRow({
  workflow,
  active,
  onOpen,
  onStart,
  startLoading,
}: {
  workflow: PublicWorkflowListItem;
  active: boolean;
  onOpen: () => void;
  onStart?: () => void;
  startLoading?: boolean;
}) {
  return (
    <div
      className={`rounded-10 px-3 py-2 mb-1 transition-colors ${
        active ? 'bg-primary-alpha-10' : 'hover:bg-neutral-50'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left bg-transparent border-none cursor-pointer p-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[13px] font-medium text-neutral-950 truncate flex-1">{workflow.name}</p>
          <Badge size="sm" variant={workflow.status === 'published' ? 'success' : 'neutral'}>
            {workflow.status}
          </Badge>
        </div>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          {workflow.stepCount} step{workflow.stepCount === 1 ? '' : 's'}
        </p>
      </button>
      {workflow.status === 'published' && onStart && (
        <Button
          variant="neutral"
          mode="stroke"
          size="sm"
          className="w-fit mt-2"
          loading={startLoading}
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
        >
          Start run
        </Button>
      )}
    </div>
  );
}

function WelcomePanel({
  canAuthor,
  selectedWorkflowId,
  workflows,
  onCreate,
  createLoading,
  onStart,
  startLoading,
  onEdit,
}: {
  canAuthor: boolean;
  selectedWorkflowId: string | null;
  workflows: PublicWorkflowListItem[];
  onCreate: () => void;
  createLoading: boolean;
  onStart: (id: string) => void;
  startLoading: boolean;
  onEdit: (id: string) => void;
}) {
  const selected = selectedWorkflowId
    ? workflows.find((w) => w.id === selectedWorkflowId)
    : null;

  if (selected && selected.status === 'published' && !canAuthor) {
    return (
      <div className="max-w-lg flex flex-col gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-neutral-950">{selected.name}</h2>
          <p className="text-[13px] text-neutral-500 mt-1">
            {selected.stepCount} tracked step{selected.stepCount === 1 ? '' : 's'} · published
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="w-fit"
          loading={startLoading}
          onClick={() => onStart(selected.id)}
        >
          Start this workflow
        </Button>
        <p className="text-[13px] text-neutral-500">
          After you start, complete steps here or ask in{' '}
          <Link to="/app/chat" className="text-primary-base no-underline hover:underline">
            Chat
          </Link>
          : “What&apos;s next in my onboarding?”
        </p>
      </div>
    );
  }

  return (
    <EmptyState
      title="Workflows"
      description={
        canAuthor
          ? 'Author guided processes in markdown, publish them, and run checklists. Select a workflow or create a draft.'
          : 'Start a published workflow from the list, or open one of your runs. Ask the brain “what’s next?” in Chat anytime.'
      }
      action={
        canAuthor ? (
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant="primary"
              size="sm"
              className="w-fit"
              loading={createLoading}
              onClick={onCreate}
            >
              Create workflow
            </Button>
            {workflows.find((w) => w.status === 'published') && (
              <Button
                variant="neutral"
                mode="stroke"
                size="sm"
                className="w-fit"
                onClick={() => {
                  const first = workflows.find((w) => w.status === 'published');
                  if (first) onEdit(first.id);
                }}
              >
                Open a published workflow
              </Button>
            )}
          </div>
        ) : undefined
      }
    />
  );
}

function AuthorPanel({
  canAuthor,
  loading,
  error,
  onRetry,
  workflow,
  markdown,
  outline,
  dirty,
  onMarkdownChange,
  onSave,
  saveLoading,
  onPublish,
  publishLoading,
  onStartRun,
  startLoading,
}: {
  canAuthor: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  workflow: PublicWorkflowDetail | null;
  markdown: string;
  outline: ReturnType<typeof parseWorkflowOutline>;
  dirty: boolean;
  onMarkdownChange: (value: string) => void;
  onSave: () => void;
  saveLoading: boolean;
  onPublish: () => void;
  publishLoading: boolean;
  onStartRun: () => void;
  startLoading: boolean;
}) {
  if (loading) return <LoadingState label="Loading workflow…" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!workflow) {
    return <EmptyState title="Workflow not found" description="Select another workflow from the list." />;
  }

  if (!canAuthor) {
    return (
      <div className="max-w-3xl flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[20px] font-semibold text-neutral-950">{workflow.name}</h2>
            <p className="text-[13px] text-neutral-500 capitalize">
              {workflow.status}
              {workflow.version ? ` · v${workflow.version.versionNumber}` : ''}
            </p>
          </div>
          {workflow.status === 'published' && (
            <Button
              variant="primary"
              size="sm"
              className="w-fit"
              loading={startLoading}
              onClick={onStartRun}
            >
              Start run
            </Button>
          )}
        </div>
        {workflow.version?.markdown ? (
          <div className="border border-neutral-200 rounded-20 p-5">
            <MarkdownContent content={workflow.version.markdown} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-5xl flex flex-col gap-4 h-full min-h-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[20px] font-semibold text-neutral-950">
            {outline.title || workflow.name}
          </h2>
          <p className="text-[13px] text-neutral-500 capitalize">
            {workflow.status}
            {workflow.version ? ` · v${workflow.version.versionNumber}` : ''}
            {dirty ? ' · unsaved changes' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="neutral"
            mode="stroke"
            size="sm"
            className="w-fit"
            loading={saveLoading}
            disabled={!dirty && !saveLoading}
            onClick={onSave}
          >
            Save
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="w-fit"
            loading={publishLoading}
            onClick={onPublish}
          >
            Publish
          </Button>
          {workflow.status === 'published' && (
            <Button
              variant="neutral"
              mode="stroke"
              size="sm"
              className="w-fit"
              loading={startLoading}
              onClick={onStartRun}
            >
              Start run
            </Button>
          )}
        </div>
      </div>

      <p className="text-[12px] text-neutral-500">
        Use <code className="text-[12px]"># Title</code>, <code className="text-[12px]">## Section</code>,
        and <code className="text-[12px]">- [ ] step</code> for tracked checklist items. Other prose is
        guidance only.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4 min-h-0">
        <div className="flex flex-col gap-3 min-w-0">
          <label className="text-[12px] font-semibold text-neutral-700" htmlFor="workflow-md">
            Markdown
          </label>
          <textarea
            id="workflow-md"
            value={markdown}
            onChange={(e) => onMarkdownChange(e.target.value)}
            spellCheck={false}
            className="min-h-[280px] w-full resize-y rounded-12 border border-neutral-200 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-alpha-10 focus:border-primary-base"
          />
          <div>
            <p className="text-[12px] font-semibold text-neutral-700 mb-2">Preview</p>
            <div className="border border-neutral-200 rounded-20 p-5 bg-neutral-50/50 max-h-[40vh] overflow-y-auto">
              {markdown.trim() ? (
                <MarkdownContent content={markdown} />
              ) : (
                <p className="text-[13px] text-neutral-500">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        </div>

        <aside className="border border-neutral-200 rounded-20 p-4 h-fit lg:sticky lg:top-0">
          <p className="text-[12px] font-semibold text-neutral-800 mb-1">Live outline</p>
          <p className="text-[11px] text-neutral-500 mb-3">
            {outline.steps.length} tracked step{outline.steps.length === 1 ? '' : 's'}
          </p>
          {outline.steps.length === 0 ? (
            <p className="text-[12px] text-neutral-500">
              Add lines like <code>- [ ] Do the thing</code> to track steps.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {outline.sections.map((section, si) => (
                <div key={`${section.heading}-${si}`}>
                  {section.heading ? (
                    <p className="text-[11px] font-semibold text-neutral-500 mb-1.5">
                      {section.heading}
                    </p>
                  ) : null}
                  <ol className="m-0 pl-4 flex flex-col gap-1.5">
                    {section.steps.map((step) => (
                      <li key={step.index} className="text-[12px] text-neutral-700">
                        <span className={step.defaultDone ? 'line-through text-neutral-400' : ''}>
                          {step.label}
                        </span>
                        {step.defaultDone ? (
                          <span className="text-[10px] text-neutral-400 ml-1">(default done)</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function RunnerPanel({
  loading,
  error,
  onRetry,
  run,
  nextStep,
  onCompleteStep,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  run: PublicWorkflowRun | null;
  nextStep: PublicWorkflowRun['steps'][number] | null;
  onCompleteStep: (step: PublicWorkflowRun['steps'][number]) => void;
}) {
  if (loading) return <LoadingState label="Loading run…" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!run) {
    return <EmptyState title="Run not found" description="Select a run from the sidebar." />;
  }

  const pct =
    run.progress.total === 0
      ? 0
      : Math.round((run.progress.done / run.progress.total) * 100);

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h2 className="text-[20px] font-semibold text-neutral-950">{run.workflowName}</h2>
        <p className="text-[13px] text-neutral-500 capitalize">
          {run.status.replace('_', ' ')} · started {new Date(run.startedAt).toLocaleString()}
        </p>
      </div>

      <div className="border border-neutral-200 rounded-20 p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-neutral-800">Progress</p>
          <p className="text-[12px] text-neutral-500">{progressLabel(run)}</p>
        </div>
        <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary-base transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {nextStep ? (
          <p className="text-[13px] text-neutral-700 mt-1">
            <span className="font-medium text-neutral-900">What&apos;s next:</span> {nextStep.label}
          </p>
        ) : (
          <p className="text-[13px] text-success-base mt-1 font-medium">All steps complete.</p>
        )}
        <p className="text-[12px] text-neutral-500">
          Ask the brain in{' '}
          <Link to="/app/chat" className="text-primary-base no-underline hover:underline">
            Chat
          </Link>
          : “What&apos;s next in my {run.workflowName} workflow?”
        </p>
      </div>

      {run.markdown?.trim() ? (
        <section className="border border-neutral-200 rounded-20 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-[13px] font-semibold text-neutral-800 m-0">Guidance</h3>
            {run.versionNumber > 0 ? (
              <p className="text-[11px] text-neutral-400 m-0">Version {run.versionNumber}</p>
            ) : null}
          </div>
          <MarkdownContent content={run.markdown} className="text-[13px] text-neutral-800" />
        </section>
      ) : null}

      <section>
        <h3 className="text-[13px] font-semibold text-neutral-800 mb-3">Checklist</h3>
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {run.steps.map((step) => {
            const done = step.status === 'done' || step.status === 'skipped';
            const isNext = nextStep?.stepKey === step.stepKey;
            return (
              <li
                key={step.id}
                className={`flex items-start gap-3 rounded-12 border px-3 py-2.5 ${
                  isNext
                    ? 'border-primary-base/40 bg-primary-alpha-10'
                    : 'border-neutral-200 bg-white'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-6 ${
                    done
                      ? 'bg-success-lighter text-success-base'
                      : 'bg-neutral-50 text-neutral-400 border border-neutral-200'
                  }`}
                  aria-hidden
                >
                  {done ? <IconCheck size={14} /> : null}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[13px] ${
                      done ? 'text-neutral-400 line-through' : 'text-neutral-900'
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.completedAt && (
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Done {new Date(step.completedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                {!done && step.status === 'pending' && (
                  <Button
                    variant={isNext ? 'primary' : 'neutral'}
                    mode={isNext ? 'filled' : 'stroke'}
                    size="sm"
                    className="w-fit shrink-0"
                    onClick={() => onCompleteStep(step)}
                  >
                    Complete
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
