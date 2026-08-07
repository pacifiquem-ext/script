import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input } from '../../components/ui/Input';
import { LoadingState } from '../../components/ui/LoadingState';
import { MarkdownContent } from '../../components/ui/MarkdownContent';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import { useAuth } from '../../contexts/useAuth';
import { getErrorMessage } from '../../lib/form-errors';
import { IconCheck, IconDelete, IconPlus } from '../../lib/icons';
import { maskSecrets } from '../../lib/mask-secrets';
import { parseWorkflowOutline } from '../../lib/parse-workflow-outline';
import { notify } from '../../components/ui/toast-alert';
import { useWorkspaces } from '../../lib/workspaces';
import {
  completeWorkflowStep,
  createBrowserSession,
  createWorkflow,
  deleteBrowserSession,
  executeWorkflowRunStream,
  getWorkflow,
  getWorkflowRun,
  listBrowserSessions,
  listMyWorkflowRuns,
  listWorkflows,
  markWorkflowVerified,
  publishWorkflow,
  startWorkflowRun,
  updateWorkflow,
  verifyWorkflow,
  type ExecutionLogEntry,
  type PublicBrowserSession,
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
  const [searchParams] = useSearchParams();
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
  const [agentExecuting, setAgentExecuting] = useState(false);
  const [activityLog, setActivityLog] = useState<ExecutionLogEntry[]>([]);
  const [liveReasoning, setLiveReasoning] = useState('');
  const [selectedVaultId, setSelectedVaultId] = useState<string>('');
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultDeleteId, setVaultDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery = searchParams.get('id');
    if (fromQuery) {
      setSelectedWorkflowId(fromQuery);
      setPanel('edit');
    }
  }, [searchParams]);

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
    refetchInterval: agentExecuting ? 2000 : false,
  });

  const vaultQuery = useQuery({
    queryKey: ['workflows', 'browser-sessions'],
    queryFn: async () => {
      const data = await listBrowserSessions();
      return data.sessions;
    },
  });

  useEffect(() => {
    if (panel !== 'edit' || !detailQuery.data) return;
    if (dirty) return;
    setMarkdown(detailQuery.data.version?.markdown ?? DEFAULT_MARKDOWN);
  }, [detailQuery.data, panel, dirty]);

  // Hydrate activity panel from persisted run log when opening a run.
  useEffect(() => {
    if (!runQuery.data || agentExecuting) return;
    setActivityLog(runQuery.data.executionLog ?? []);
  }, [runQuery.data?.id, runQuery.data?.executionLog?.length, agentExecuting]);

  const outline = useMemo(() => parseWorkflowOutline(markdown), [markdown]);

  const invalidateLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };

  const pushActivity = (entry: ExecutionLogEntry) => {
    setActivityLog((prev) => {
      if (prev.some((e) => e.id === entry.id)) return prev;
      return [...prev, entry].slice(-200);
    });
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
        // Saving invalidates verification — block before call
        throw new Error('Save and Verify with agent again before publishing unsaved changes.');
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

  const createVaultMutation = useMutation({
    mutationFn: (input: { name: string; storageState: unknown }) => createBrowserSession(input),
    onSuccess: async (session) => {
      setVaultModalOpen(false);
      setSelectedVaultId(session.id);
      notify.success('Browser login saved encrypted.', 'Vault');
      await queryClient.invalidateQueries({ queryKey: ['workflows', 'browser-sessions'] });
    },
    onError: (err) => notify.error(getErrorMessage(err, 'Could not save browser session')),
  });

  const deleteVaultMutation = useMutation({
    mutationFn: (id: string) => deleteBrowserSession(id),
    onSuccess: async (_ok, id) => {
      if (selectedVaultId === id) setSelectedVaultId('');
      setVaultDeleteId(null);
      notify.success('Browser login removed.', 'Vault');
      await queryClient.invalidateQueries({ queryKey: ['workflows', 'browser-sessions'] });
    },
    onError: (err) => notify.error(getErrorMessage(err, 'Could not delete browser session')),
  });

  const runWithAgent = async (
    runId: string,
    opts?: { markVerifiedWorkflowId?: string },
  ) => {
    setError(null);
    setMessage(null);
    setAgentExecuting(true);
    setLiveReasoning('');
    try {
      for await (const event of executeWorkflowRunStream(runId, {
        browserSessionId: selectedVaultId || undefined,
      })) {
        if ('log' in event && event.log) pushActivity(event.log);

        if (event.type === 'step_completed' || event.type === 'step_failed') {
          await queryClient.invalidateQueries({ queryKey: ['workflows', 'runs', runId] });
        } else if (event.type === 'delta') {
          setLiveReasoning((prev) => (prev + event.text).slice(-4000));
        } else if (event.type === 'reasoning') {
          setLiveReasoning('');
        } else if (event.type === 'done') {
          setLiveReasoning('');
          await queryClient.setQueryData(['workflows', 'runs', event.run.id], event.run);
          await queryClient.invalidateQueries({ queryKey: ['workflows', 'runs', 'mine'] });
          setActivityLog(event.run.executionLog ?? []);
          const left = event.run.progress.pending;
          if (opts?.markVerifiedWorkflowId) {
            try {
              const wf = await markWorkflowVerified(opts.markVerifiedWorkflowId, event.run.id);
              await queryClient.setQueryData(['workflows', opts.markVerifiedWorkflowId], wf);
              await invalidateLists();
              setMessage(
                left === 0
                  ? 'Verification passed. You can publish this workflow.'
                  : `Verification finished with ${left} step(s) still open (e.g. login-only). Draft is verified — you can publish.`,
              );
            } catch (err) {
              setError(getErrorMessage(err, 'Could not mark workflow verified'));
            }
          } else {
            setMessage(
              left === 0
                ? 'Agent finished all steps.'
                : `Agent finished with ${left} step(s) still open — see Activity for why.`,
            );
          }
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Agent execution failed'));
    } finally {
      setAgentExecuting(false);
      setLiveReasoning('');
      await queryClient.invalidateQueries({ queryKey: ['workflows', 'runs', runId] });
      await queryClient.invalidateQueries({ queryKey: ['workflows', 'runs', 'mine'] });
    }
  };

  const verifyMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      if (dirty) {
        await updateWorkflow(workflowId, markdown);
      }
      return verifyWorkflow(workflowId);
    },
    onSuccess: async (result) => {
      setDirty(false);
      setError(null);
      setMarkdown(result.workflow.version?.markdown ?? markdown);
      setSelectedWorkflowId(result.workflow.id);
      setSelectedRunId(result.run.id);
      setPanel('run');
      setActivityLog(result.run.executionLog ?? []);
      await queryClient.setQueryData(['workflows', result.workflow.id], result.workflow);
      await queryClient.setQueryData(['workflows', 'runs', result.run.id], result.run);
      await invalidateLists();
      setMessage(
        result.polished
          ? 'Instructions polished — running verification agent…'
          : 'Running verification agent…',
      );
      void runWithAgent(result.run.id, { markVerifiedWorkflowId: result.workflow.id });
    },
    onError: (err) => setError(getErrorMessage(err, 'Verification failed to start')),
  });

  const startRunMutation = useMutation({
    mutationFn: async (workflowId: string) => startWorkflowRun(workflowId),
    onSuccess: async (run) => {
      setMessage('Run started — agent is executing steps…');
      setSelectedWorkflowId(run.workflowId);
      setSelectedRunId(run.id);
      setPanel('run');
      setActivityLog(run.executionLog ?? []);
      await queryClient.invalidateQueries({ queryKey: ['workflows', 'runs', 'mine'] });
      await queryClient.setQueryData(['workflows', 'runs', run.id], run);
      // Critical: Start run used to only create a row (in_progress). Now kick the agent immediately.
      void runWithAgent(run.id);
    },
    onError: (err) => setError(getErrorMessage(err, 'Could not start run')),
  });

  const completeMutation = useMutation({
    mutationFn: async (target: { runId: string; stepKey: string; label: string }) =>
      completeWorkflowStep(target.runId, target.stepKey, {
        source: 'ui',
        evidence: {
          method: 'manual',
          summary: `Assignee confirmed offline work for “${target.label}”`,
        },
      }),
    onSuccess: async (run) => {
      setCompleteTarget(null);
      setMessage('Step marked complete (manual). Prefer agent execution for web steps.');
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
            Guided processes in markdown. Start a run, then let the agent execute web steps with
            browser tools — or ask what&apos;s next in Chat.
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

          <SectionLabel>Browser login vault</SectionLabel>
          <p className="px-3 pb-2 text-[11px] text-neutral-500 leading-relaxed">
            Encrypted Playwright cookies for logged-in agent runs. Export{' '}
            <code className="text-[11px]">storageState</code> from codegen.
          </p>
          {vaultQuery.isLoading && (
            <p className="px-3 py-2 text-[12px] text-neutral-500">Loading vault…</p>
          )}
          {vaultQuery.isError && (
            <p className="px-3 py-2 text-[12px] text-error-base" role="alert">
              {getErrorMessage(vaultQuery.error, 'Could not load vault')}
            </p>
          )}
          {(vaultQuery.data ?? []).map((session) => (
            <div
              key={session.id}
              className={`flex items-center gap-1 rounded-10 px-2 py-1 mb-1 ${
                selectedVaultId === session.id ? 'bg-primary-alpha-10' : ''
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 border-none bg-transparent text-left cursor-pointer px-1 py-1"
                onClick={() =>
                  setSelectedVaultId((prev) => (prev === session.id ? '' : session.id))
                }
              >
                <p className="text-[13px] font-medium text-neutral-950 truncate m-0">{session.name}</p>
                <p className="text-[11px] text-neutral-500 m-0">
                  {session.lastUsedAt
                    ? `Used ${new Date(session.lastUsedAt).toLocaleDateString()}`
                    : `Saved ${new Date(session.createdAt).toLocaleDateString()}`}
                </p>
              </button>
              <Button
                type="button"
                size="xs"
                variant="neutral"
                mode="ghost"
                className="w-fit shrink-0"
                aria-label={`Delete ${session.name}`}
                onClick={() => setVaultDeleteId(session.id)}
              >
                <IconDelete size={14} />
              </Button>
            </div>
          ))}
          <div className="px-3 pt-1 pb-3">
            <Button
              type="button"
              size="sm"
              variant="neutral"
              mode="stroke"
              className="w-fit"
              onClick={() => setVaultModalOpen(true)}
            >
              Add login
            </Button>
          </div>
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
              if (dirty) {
                setError('Save your changes, then Verify with agent before publishing.');
                return;
              }
              if (!detailQuery.data?.canPublish) {
                setError(
                  'Verify with agent first so we can confirm the workflow runs. Then publish.',
                );
                return;
              }
              setPublishOpen(true);
            }}
            publishLoading={publishMutation.isPending}
            canPublish={Boolean(detailQuery.data?.canPublish) && !dirty}
            verifiedAt={detailQuery.data?.version?.verifiedAt ?? null}
            onVerify={() => {
              if (!selectedWorkflowId) return;
              setError(null);
              verifyMutation.mutate(selectedWorkflowId);
            }}
            verifyLoading={verifyMutation.isPending || agentExecuting}
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
            agentExecuting={agentExecuting}
            activityLog={activityLog}
            liveReasoning={liveReasoning}
            vaults={vaultQuery.data ?? []}
            selectedVaultId={selectedVaultId}
            onSelectVault={setSelectedVaultId}
            onRunWithAgent={() => {
              if (!activeRun) return;
              void runWithAgent(activeRun.id);
            }}
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
            : `Publish “${outline.title}” with ${outline.steps.length} tracked step${outline.steps.length === 1 ? '' : 's'}? This draft was verified with the agent. Members can start runs against this version.`
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
        title="Mark step done manually?"
        description={
          completeTarget
            ? `Confirm you completed “${maskSecrets(completeTarget.label)}” yourself (offline work the agent cannot do). Prefer “Run with agent” for web steps like visiting a URL.`
            : undefined
        }
        confirmLabel="I did this myself"
        loading={completeMutation.isPending}
        onConfirm={() => {
          if (!completeTarget) return;
          completeMutation.mutate(completeTarget);
        }}
      />

      <BrowserVaultModal
        open={vaultModalOpen}
        loading={createVaultMutation.isPending}
        onOpenChange={setVaultModalOpen}
        onSubmit={(input) => createVaultMutation.mutate(input)}
      />

      <ConfirmModal
        open={Boolean(vaultDeleteId)}
        onOpenChange={(open) => {
          if (!open) setVaultDeleteId(null);
        }}
        title="Delete browser login?"
        description="This removes the encrypted cookies. Agent runs will start anonymous until you add another login."
        confirmLabel="Delete"
        destructive
        loading={deleteVaultMutation.isPending}
        onConfirm={() => {
          if (!vaultDeleteId) return;
          deleteVaultMutation.mutate(vaultDeleteId);
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
          Start & run agent
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
          Start & run agent
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
  canPublish,
  verifiedAt,
  onVerify,
  verifyLoading,
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
  canPublish: boolean;
  verifiedAt: string | null;
  onVerify: () => void;
  verifyLoading: boolean;
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
              Start & run agent
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
            variant="neutral"
            mode="stroke"
            size="sm"
            className="w-fit"
            loading={verifyLoading}
            disabled={verifyLoading || outline.steps.length === 0}
            onClick={onVerify}
          >
            Verify with agent
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="w-fit"
            loading={publishLoading}
            disabled={!canPublish || publishLoading}
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
              Start & run agent
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {verifiedAt && !dirty ? (
          <Badge size="sm" variant="success">
            Verified {new Date(verifiedAt).toLocaleString()}
          </Badge>
        ) : (
          <Badge size="sm" variant="warning">
            Not verified — run Verify with agent before publish
          </Badge>
        )}
        {dirty ? (
          <span className="text-[12px] text-neutral-500">Unsaved changes clear verification</span>
        ) : null}
      </div>

      <p className="text-[12px] text-neutral-500">
        Use <code className="text-[12px]"># Title</code>, <code className="text-[12px]">## Section</code>,
        and <code className="text-[12px]">- [ ] step</code> for tracked checklist items. Other prose is
        guidance only. <strong>Verify with agent</strong> polishes wording and runs the agent so you
        see Activity logs before publishing.
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

function agentStatusBadge(status: string | undefined): {
  label: string;
  variant: 'neutral' | 'success' | 'error' | 'warning' | 'primary';
} {
  switch (status) {
    case 'running':
      return { label: 'Agent running', variant: 'primary' };
    case 'completed':
      return { label: 'Agent finished', variant: 'success' };
    case 'failed':
      return { label: 'Agent failed', variant: 'error' };
    default:
      return { label: 'Agent idle', variant: 'neutral' };
  }
}

function kindStyles(kind: ExecutionLogEntry['kind']): string {
  switch (kind) {
    case 'phase':
      return 'border-primary-base/30 bg-primary-alpha-10 text-neutral-900';
    case 'reasoning':
      return 'border-neutral-200 bg-white text-neutral-800';
    case 'tool':
      return 'border-blue-100 bg-blue-50/60 text-neutral-900';
    case 'tool_result':
      return 'border-neutral-200 bg-neutral-50 text-neutral-700';
    case 'step':
      return 'border-success-base/30 bg-success-lighter/40 text-neutral-900';
    case 'step_failed':
      return 'border-warning-base/40 bg-warning-lighter/50 text-neutral-900';
    case 'error':
      return 'border-error-base/40 bg-error-lighter/40 text-neutral-900';
    case 'done':
      return 'border-success-base/40 bg-success-lighter/50 text-neutral-900';
    default:
      return 'border-neutral-200 bg-white text-neutral-700';
  }
}

function kindLabel(kind: ExecutionLogEntry['kind']): string {
  switch (kind) {
    case 'phase':
      return 'Stage';
    case 'reasoning':
      return 'Thinking';
    case 'tool':
      return 'Action';
    case 'tool_result':
      return 'Result';
    case 'step':
      return 'Done';
    case 'step_failed':
      return 'Blocked';
    case 'error':
      return 'Error';
    case 'done':
      return 'Summary';
    default:
      return 'Update';
  }
}

function ActivityPanel({
  agentExecuting,
  agentStatus,
  agentSummary,
  activityLog,
  liveReasoning,
}: {
  agentExecuting: boolean;
  agentStatus: string;
  agentSummary: string | null;
  activityLog: ExecutionLogEntry[];
  liveReasoning: string;
}) {
  const badge = agentStatusBadge(agentExecuting ? 'running' : agentStatus);
  const hasContent = activityLog.length > 0 || liveReasoning.trim() || agentExecuting;

  return (
    <section className="border border-neutral-200 rounded-20 p-4 flex flex-col gap-3 bg-neutral-50/40">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-[13px] font-semibold text-neutral-800 m-0">Activity</h3>
          <p className="text-[12px] text-neutral-500 m-0 mt-0.5">
            Live agent log, tools, and reasoning for this run
          </p>
        </div>
        <Badge size="sm" variant={badge.variant}>
          {badge.label}
        </Badge>
      </div>

      {agentSummary ? (
        <Alert
          status={
            agentStatus === 'failed'
              ? 'error'
              : agentStatus === 'completed' && !agentExecuting
                ? 'success'
                : 'information'
          }
          variant="lighter"
          className="rounded-12"
          description={maskSecrets(agentSummary)}
        />
      ) : null}

      {!hasContent ? (
        <p className="text-[12px] text-neutral-500 m-0">
          No agent activity yet. Click <strong>Start run</strong> or <strong>Run agent now</strong>{' '}
          — the agent will open pages, click/type, and record evidence here.
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
          {activityLog.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-12 border px-3 py-2 ${kindStyles(entry.kind)}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {kindLabel(entry.kind)}
                </span>
                <span className="text-[10px] text-neutral-400">
                  {new Date(entry.at).toLocaleTimeString()}
                </span>
                {typeof entry.ok === 'boolean' ? (
                  <span
                    className={`text-[10px] font-medium ${
                      entry.ok ? 'text-success-base' : 'text-error-base'
                    }`}
                  >
                    {entry.ok ? 'worked' : 'didn’t work'}
                  </span>
                ) : null}
              </div>
              <p className="text-[12px] m-0 mt-1 leading-relaxed">{maskSecrets(entry.message)}</p>
              {entry.detail &&
              !entry.detail.trimStart().startsWith('{') &&
              !entry.detail.trimStart().startsWith('[') ? (
                <p className="mt-1.5 mb-0 text-[11px] text-neutral-600 leading-relaxed max-h-24 overflow-y-auto">
                  {maskSecrets(entry.detail)}
                </p>
              ) : null}
            </div>
          ))}

          {liveReasoning.trim() ? (
            <div className={`rounded-12 border px-3 py-2 ${kindStyles('reasoning')}`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  Reasoning
                </span>
                <span className="text-[10px] text-primary-base font-medium">live…</span>
              </div>
              <p className="text-[12px] m-0 mt-1 leading-relaxed whitespace-pre-wrap">
                {maskSecrets(liveReasoning)}
              </p>
            </div>
          ) : null}

          {agentExecuting && activityLog.length === 0 && !liveReasoning.trim() ? (
            <p className="text-[12px] text-neutral-500 m-0">Starting agent…</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function RunnerPanel({
  loading,
  error,
  onRetry,
  run,
  nextStep,
  agentExecuting,
  activityLog,
  liveReasoning,
  vaults,
  selectedVaultId,
  onSelectVault,
  onRunWithAgent,
  onCompleteStep,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  run: PublicWorkflowRun | null;
  nextStep: PublicWorkflowRun['steps'][number] | null;
  agentExecuting: boolean;
  activityLog: ExecutionLogEntry[];
  liveReasoning: string;
  vaults: PublicBrowserSession[];
  selectedVaultId: string;
  onSelectVault: (id: string) => void;
  onRunWithAgent: () => void;
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
  const hasPending = run.progress.pending > 0;

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[20px] font-semibold text-neutral-950">{run.workflowName}</h2>
          <p className="text-[13px] text-neutral-500 capitalize">
            {run.status.replace('_', ' ')} · started {new Date(run.startedAt).toLocaleString()}
          </p>
        </div>
        {hasPending ? (
          <div className="flex flex-col items-end gap-2">
            <label className="flex flex-col gap-1 text-[12px] text-neutral-600">
              Browser login
              <select
                className="h-8 min-w-[180px] rounded-8 border border-neutral-200 bg-white px-2 text-[12px] text-neutral-900"
                value={selectedVaultId}
                disabled={agentExecuting}
                onChange={(e) => onSelectVault(e.target.value)}
              >
                <option value="">Anonymous (no cookies)</option>
                {vaults.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="primary"
              size="sm"
              className="w-fit"
              loading={agentExecuting}
              disabled={agentExecuting}
              onClick={onRunWithAgent}
            >
              {agentExecuting ? 'Agent running…' : 'Run agent now'}
            </Button>
          </div>
        ) : null}
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
            <span className="font-medium text-neutral-900">What&apos;s next:</span>{' '}
            {maskSecrets(nextStep.label)}
          </p>
        ) : (
          <p className="text-[13px] text-success-base mt-1 font-medium">All steps complete.</p>
        )}
        <p className="text-[12px] text-neutral-500">
          <strong>Start run</strong> creates a run <em>and</em> starts the agent. Watch Activity
          below for tools and reasoning. Use “I did this” only for offline steps. Ask in{' '}
          <Link to="/app/chat" className="text-primary-base no-underline hover:underline">
            Chat
          </Link>{' '}
          anytime.
        </p>
      </div>

      <ActivityPanel
        agentExecuting={agentExecuting}
        agentStatus={run.agentStatus}
        agentSummary={run.agentSummary}
        activityLog={activityLog}
        liveReasoning={liveReasoning}
      />

      {run.markdown?.trim() ? (
        <section className="border border-neutral-200 rounded-20 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-[13px] font-semibold text-neutral-800 m-0">Guidance</h3>
            {run.versionNumber > 0 ? (
              <p className="text-[11px] text-neutral-400 m-0">Version {run.versionNumber}</p>
            ) : null}
          </div>
          <MarkdownContent
            content={maskSecrets(run.markdown)}
            className="text-[13px] text-neutral-800"
          />
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
                    {maskSecrets(step.label)}
                  </p>
                  {step.completedAt && (
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Done {new Date(step.completedAt).toLocaleString()}
                      {step.evidence?.method === 'agent_browser'
                        ? ' · agent browser'
                        : step.evidence?.method === 'manual'
                          ? ' · manual'
                          : step.evidence
                            ? ` · ${step.evidence.method}`
                            : ''}
                    </p>
                  )}
                  {step.evidence?.summary && (
                    <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">
                      {step.evidence.summary}
                    </p>
                  )}
                </div>
                {!done && step.status === 'pending' && (
                  <Button
                    variant="neutral"
                    mode="stroke"
                    size="sm"
                    className="w-fit shrink-0"
                    disabled={agentExecuting}
                    onClick={() => onCompleteStep(step)}
                  >
                    I did this
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

function BrowserVaultModal({
  open,
  loading,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; storageState: unknown }) => void;
}) {
  const nameId = useId();
  const jsonId = useId();
  const [name, setName] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setJsonText('');
      setError(null);
    }
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError('storageState must be valid JSON (Playwright cookies / origins).');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('storageState must be a JSON object with cookies[] or origins[].');
      return;
    }
    const rec = parsed as { cookies?: unknown; origins?: unknown };
    if (!Array.isArray(rec.cookies) && !Array.isArray(rec.origins)) {
      setError('storageState must include a cookies array or origins array.');
      return;
    }
    setError(null);
    onSubmit({ name: trimmedName, storageState: parsed });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent showClose={!loading} size="lg">
        <ModalHeader title="Save browser login" />
        <ModalBody align="start">
          Paste a Playwright <code className="text-[12px]">storageState</code> JSON file (from
          codegen or <code className="text-[12px]">context.storageState()</code>). Cookies are
          encrypted at rest and never shown again.
        </ModalBody>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {error ? (
            <Alert status="error" variant="lighter" compact description={error} />
          ) : null}
          <Input
            id={nameId}
            label="Name"
            placeholder="GitHub logged-in"
            value={name}
            disabled={loading}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-[#4B5563] text-label-sm" htmlFor={jsonId}>
              storageState JSON
            </label>
            <textarea
              id={jsonId}
              value={jsonText}
              disabled={loading}
              spellCheck={false}
              rows={8}
              placeholder='{"cookies":[{"name":"session","value":"…","domain":".example.com","path":"/"}],"origins":[]}'
              className="min-h-[160px] w-full resize-y rounded-10 border border-neutral-200 bg-[#F9FAFB] px-3 py-2 font-mono text-[12px] leading-relaxed text-neutral-800 focus:outline-none focus:border-primary-base"
              onChange={(e) => setJsonText(e.target.value)}
            />
          </div>
          <ModalFooter align="end">
            <Button
              type="button"
              size="sm"
              variant="neutral"
              mode="stroke"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="w-fit" loading={loading}>
              Save encrypted
            </Button>
          </ModalFooter>
        </form>
        <Dialog.Description className="sr-only">
          Save encrypted Playwright storageState for workflow browser runs
        </Dialog.Description>
      </ModalContent>
    </Modal>
  );
}
