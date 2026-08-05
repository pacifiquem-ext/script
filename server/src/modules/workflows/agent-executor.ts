import type { WorkspaceRole } from '@prisma/client';
import {
  WORKFLOW_EXECUTOR_SYSTEM_PROMPT,
  workflowExecutorAgent,
} from '../../mastra/agents/workflow-executor';
import { toRequestContext } from '../../mastra/request-context';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';
import {
  appendExecutionLog,
  flushReasoningLog,
  makeLogEntry,
  setAgentRunning,
  type ExecutionLogEntry,
} from './execution-log';
import {
  humanizePhase,
  humanizeReasoning,
  humanizeToolCall,
  humanizeToolResult,
} from './humanize-activity';
import { buildPolishedStepBrief, polishWorkflowMarkdown } from './polish-workflow';
import {
  browserNavigate,
  browserSnapshot,
  closeBrowserSession,
  getBrowserActions,
} from './browser-session';
import * as workflows from './workflow-service';
import type { PublicWorkflowRun, StepEvidence } from './workflow-service';

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

/** Extract a navigable URL from a plain-English step label when possible. */
export function extractUrlFromStepLabel(label: string): string | null {
  const trimmed = label.trim();
  // Don't treat PAT/token lines as navigation just because they mention github.
  if (/\b(pat|token|api[_-]?key|secret|password)\b/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    const onlyUrl = trimmed.match(/https?:\/\/[^\s)\]>"']+/i);
    if (!onlyUrl) return null;
  }
  const urlMatch = trimmed.match(/https?:\/\/[^\s)\]>"']+/i);
  if (urlMatch) return urlMatch[0].replace(/[.,;:!?)]+$/, '');

  const goTo = trimmed.match(
    /(?:go\s+to|visit|open|navigate\s+to|browse\s+to)\s+([a-z0-9][-a-z0-9.]+\.[a-z]{2,}(?:\/[^\s]*)?)/i,
  );
  if (goTo?.[1]) {
    const host = goTo[1].replace(/[.,;:!?)]+$/, '');
    return host.startsWith('http') ? host : `https://${host}`;
  }

  const bare = trimmed.match(/\b([a-z0-9][-a-z0-9]*\.(?:com|org|net|io|dev|ai|co)(?:\/[^\s]*)?)\b/i);
  if (bare?.[1] && /go|visit|open|navigate|browse|check|view|see/i.test(trimmed)) {
    return `https://${bare[1]}`;
  }
  return null;
}

/**
 * Deterministic browser execution for simple navigation-style steps.
 */
export async function executeSimpleNavigateStep(input: {
  sessionKey: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  runId: string;
  stepKey: string;
  label: string;
}): Promise<{ ok: true; evidence: StepEvidence } | { ok: false; reason: string }> {
  const url = extractUrlFromStepLabel(input.label);
  if (!url) {
    return { ok: false, reason: 'Step is not a simple navigation instruction' };
  }
  try {
    const snap = await browserNavigate(input.sessionKey, url);
    const final = await browserSnapshot(input.sessionKey);
    const target = new URL(url.startsWith('http') ? url : `https://${url}`);
    const landed = new URL(final.url || snap.url || 'about:blank');
    const targetHost = target.hostname.replace(/^www\./i, '').toLowerCase();
    const landedHost = landed.hostname.replace(/^www\./i, '').toLowerCase();
    const hostOk =
      landedHost === targetHost ||
      landedHost.endsWith(`.${targetHost}`) ||
      targetHost.endsWith(`.${landedHost}`);
    if (!hostOk) {
      return {
        ok: false,
        reason: `Navigation did not land on expected host (wanted ${targetHost}, got ${final.url})`,
      };
    }
    const targetPath = target.pathname.replace(/\.git$/i, '').replace(/\/$/, '') || '';
    if (targetPath && targetPath !== '') {
      const landedPath = landed.pathname.replace(/\/$/, '');
      const pathOk =
        landedPath === targetPath ||
        landedPath.startsWith(`${targetPath}/`) ||
        targetPath.startsWith(landedPath);
      const title404 = /page not found|404|not found/i.test(final.title || '');
      const body404 = /page not found|404|this is not the web page you are looking for/i.test(
        final.text.slice(0, 2000),
      );
      if (title404 || body404) {
        return {
          ok: false,
          reason: `Page looks like a 404 after opening ${url} (title: ${final.title})`,
        };
      }
      if (!pathOk && targetPath.split('/').filter(Boolean).length >= 2) {
        return {
          ok: false,
          reason: `Landed on ${final.url}, which does not match expected path ${targetPath}`,
        };
      }
    }
    const actions = getBrowserActions(input.sessionKey);
    const evidence: StepEvidence = {
      method: 'agent_browser',
      summary: `Opened ${url}. Landed on “${final.title || final.url}” (${final.url}).`,
      finalUrl: final.url || snap.url,
      actions: actions.slice(-10),
    };
    await workflows.completeStep(input.workspaceId, input.userId, input.runId, input.stepKey, {
      role: input.role,
      source: 'agent_browser',
      evidence,
    });
    return { ok: true, evidence };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Browser navigation failed',
    };
  }
}

function completionAvailable(): boolean {
  if (env.NODE_ENV === 'test') return false;
  if (env.COMPLETION_PROVIDER === 'openai_compatible') {
    return Boolean(env.COMPLETION_BASE_URL);
  }
  return Boolean(env.ANTHROPIC_API_KEY || env.COMPLETION_API_KEY);
}

async function emitAndLog(
  runId: string,
  kind: ExecutionLogEntry['kind'],
  message: string,
  extra?: Partial<Omit<ExecutionLogEntry, 'id' | 'at' | 'kind' | 'message'>>,
  agentOpts?: { agentStatus?: string; agentSummary?: string },
): Promise<ExecutionLogEntry> {
  const entry = makeLogEntry(kind, message, extra);
  // Do not surface raw tool ids in the user-facing message field.
  if (entry.toolName && entry.kind === 'tool') {
    entry.toolName = undefined;
  }
  await appendExecutionLog(runId, entry, agentOpts);
  return entry;
}

/**
 * Execute pending workflow steps with browser tools + live activity log.
 */
export async function* executeWorkflowRun(input: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  runId: string;
  maxClearanceLevel?: number;
  signal?: AbortSignal;
}): AsyncGenerator<WorkflowExecuteEvent> {
  const sessionKey = `run:${input.runId}`;
  let reasoningBuf = '';

  const flushReasoning = async function* () {
    if (!reasoningBuf.trim()) return;
    const text = reasoningBuf;
    reasoningBuf = '';
    const cleaned = humanizeReasoning(text);
    const log = await flushReasoningLog(input.runId, cleaned);
    if (log) yield { type: 'reasoning' as const, text: cleaned, log };
  };

  try {
    let run = await workflows.getRun(
      input.workspaceId,
      input.userId,
      input.runId,
      input.role,
    );

    if (run.assigneeUserId !== input.userId && input.role !== 'owner' && input.role !== 'admin') {
      const log = await emitAndLog(
        input.runId,
        'error',
        'Only the run assignee (or admin) may execute this run with the agent',
        {},
        { agentStatus: 'failed', agentSummary: 'Forbidden' },
      );
      yield { type: 'error', code: 'FORBIDDEN', message: log.message, log };
      return;
    }

    await setAgentRunning(input.runId);
    {
      const log = await emitAndLog(
        input.runId,
        'phase',
        humanizePhase('Starting agent execution…'),
        {
          detail: `${run.progress.pending} of ${run.progress.total} step(s) still open`,
        },
        { agentStatus: 'running', agentSummary: 'Agent is working through your steps…' },
      );
      yield { type: 'phase', message: log.message, log };
    }

    // Polish instructions for the agent prompt (and log what we did).
    let polishedMarkdown = run.markdown;
    {
      const log = await emitAndLog(
        input.runId,
        'phase',
        humanizePhase('Polishing workflow instructions…'),
        {
          detail: 'Making steps clearer before the agent runs them.',
        },
      );
      yield { type: 'phase', message: log.message, log };
      try {
        const polished = await polishWorkflowMarkdown(run.markdown);
        polishedMarkdown = polished.markdown;
        const polishLog = await emitAndLog(
          input.runId,
          'status',
          polished.changed
            ? `Instructions polished (${polished.method === 'llm' ? 'AI + cleanup' : 'cleanup'})`
            : 'Instructions already clear — no polish needed',
          {
            detail: polished.changed
              ? 'Step wording was cleaned up for the agent (URLs, grammar, clarity).'
              : undefined,
          },
        );
        yield { type: 'status', message: polishLog.message, log: polishLog };
      } catch {
        // continue with original markdown
      }
    }

    const pending = () => run.steps.filter((s) => s.status === 'pending');

    // Phase 1: simple navigate heuristics
    {
      const log = await emitAndLog(
        input.runId,
        'phase',
        humanizePhase('Phase 1: auto-navigate steps (no LLM)'),
        {
          detail: 'Opening web links from steps like “Go to https://github.com” automatically.',
        },
      );
      yield { type: 'phase', message: log.message, log };
    }

    for (const step of pending()) {
      if (input.signal?.aborted) break;
      const url = extractUrlFromStepLabel(step.label);
      if (!url) {
        const log = await emitAndLog(
          input.runId,
          'status',
          `“${step.label.slice(0, 80)}” needs more than opening a link — saving for the agent`,
          { stepKey: step.stepKey },
        );
        yield { type: 'status', message: log.message, log };
        continue;
      }

      {
        const log = await emitAndLog(
          input.runId,
          'status',
          `Working on: ${step.label.slice(0, 120)}`,
          { stepKey: step.stepKey },
        );
        yield { type: 'status', message: log.message, log };
      }

      {
        const human = humanizeToolCall('browser_navigate', { url });
        const log = await emitAndLog(input.runId, 'tool', human.message, {
          stepKey: step.stepKey,
        });
        yield {
          type: 'tool_call',
          name: 'browser_navigate',
          input: { url },
          statusLabel: human.message,
          log,
        };
      }

      const result = await executeSimpleNavigateStep({
        sessionKey,
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        runId: input.runId,
        stepKey: step.stepKey,
        label: step.label,
      });

      {
        const human = humanizeToolResult(
          'browser_navigate',
          result.ok,
          result.ok ? result.evidence.summary : result.reason,
          { url },
        );
        const log = await emitAndLog(input.runId, 'tool_result', human.message, {
          ok: result.ok,
          detail: human.detail,
          stepKey: step.stepKey,
        });
        yield {
          type: 'tool_result',
          name: 'browser_navigate',
          ok: result.ok,
          detail: human.detail ?? human.message,
          log,
        };
      }

      if (result.ok) {
        const log = await emitAndLog(
          input.runId,
          'step',
          `Completed: ${step.label.slice(0, 120)}`,
          {
            stepKey: step.stepKey,
            ok: true,
            detail: result.evidence.summary,
          },
        );
        yield {
          type: 'step_completed',
          stepKey: step.stepKey,
          label: step.label,
          evidence: result.evidence,
          log,
        };
        run = await workflows.getRun(
          input.workspaceId,
          input.userId,
          input.runId,
          input.role,
        );
      } else {
        const log = await emitAndLog(
          input.runId,
          'step_failed',
          `Couldn’t finish: ${step.label.slice(0, 80)}`,
          { stepKey: step.stepKey, ok: false, detail: result.reason },
        );
        yield {
          type: 'step_failed',
          stepKey: step.stepKey,
          label: step.label,
          reason: result.reason,
          log,
        };
      }
    }

    // Phase 2: LLM agent
    const stillPending = pending();
    if (stillPending.length > 0 && completionAvailable() && !input.signal?.aborted) {
      {
        const log = await emitAndLog(
          input.runId,
          'phase',
          humanizePhase(`Phase 2: workflow agent for ${stillPending.length} remaining step(s)`),
          {
            detail: stillPending.map((s) => `• ${s.label}`).join('\n').slice(0, 2000),
          },
        );
        yield { type: 'phase', message: log.message, log };
      }

      const stepList = buildPolishedStepBrief(stillPending);

      const userPrompt = `Execute this workflow run end-to-end using browser tools, then complete each step with evidence.

Run id: ${run.id}
Workflow: ${run.workflowName}

Polished guidance (markdown):
---
${polishedMarkdown.slice(0, 8000)}
---

Pending steps (in order — use the stepKey when completing):
${stepList}

For each step: use browser tools to do what the step says, verify the page, then complete_workflow_step with evidence (method agent_browser, summary, finalUrl, actions).
If a step cannot be done in the browser (needs user login, secret vault, offline human work), leave it pending and explain why clearly in your final message.
Do not invent success. Write user-facing summaries in plain English.`;

      const requestContext = toRequestContext({
        workspaceId: input.workspaceId,
        userId: input.userId,
        maxClearanceLevel: input.maxClearanceLevel,
        browserSessionId: sessionKey,
        runId: input.runId,
      });

      try {
        const stream = await workflowExecutorAgent.stream(
          [{ role: 'user', content: userPrompt }],
          {
            requestContext,
            instructions: WORKFLOW_EXECUTOR_SYSTEM_PROMPT,
            maxSteps: Math.min(8 + stillPending.length * 6, 40),
            abortSignal: input.signal,
          },
        );

        for await (const chunk of stream.fullStream) {
          if (input.signal?.aborted) break;
          const type = (chunk as { type: string }).type;
          const payload = ((chunk as { payload?: Record<string, unknown> }).payload ??
            {}) as Record<string, unknown>;

          if (type === 'text-delta') {
            const text = typeof payload.text === 'string' ? payload.text : '';
            if (text) {
              reasoningBuf += text;
              yield { type: 'delta', text };
              // Flush reasoning in sentence-ish chunks so UI updates live
              if (reasoningBuf.length > 280 || /[.!?]\s$/.test(reasoningBuf)) {
                yield* flushReasoning();
              }
            }
            continue;
          }

          if (type === 'tool-call') {
            yield* flushReasoning();
            const name = String(payload.toolName ?? 'tool');
            const args = payload.args ?? {};
            const human = humanizeToolCall(name, args);
            const log = await emitAndLog(input.runId, 'tool', human.message, {
              detail: human.detail,
            });
            yield {
              type: 'tool_call',
              name,
              input: args,
              statusLabel: human.message,
              log,
            };
            continue;
          }

          if (type === 'tool-result') {
            yield* flushReasoning();
            const name = String(payload.toolName ?? 'tool');
            const isError = Boolean(payload.isError);
            const result = payload.result;
            let rawDetail = '';
            if (result && typeof result === 'object') {
              const r = result as Record<string, unknown>;
              if (typeof r.error === 'string') rawDetail = r.error;
              else if (typeof r.summary === 'string') rawDetail = r.summary;
              else if (typeof r.url === 'string') {
                rawDetail = `Opened page${typeof r.title === 'string' && r.title ? `: ${r.title}` : ''}`;
              }
            }
            const human = humanizeToolResult(name, !isError, rawDetail || undefined, {});
            const log = await emitAndLog(input.runId, 'tool_result', human.message, {
              ok: !isError,
              detail: human.detail,
            });
            yield {
              type: 'tool_result',
              name,
              ok: !isError,
              detail: human.detail ?? human.message,
              log,
            };

            if (name === 'complete_workflow_step' && !isError) {
              run = await workflows.getRun(
                input.workspaceId,
                input.userId,
                input.runId,
                input.role,
              );
              const newlyDone = run.steps.filter((s) => s.status === 'done' && s.evidence);
              for (const s of newlyDone.slice(-1)) {
                const stepLog = await emitAndLog(
                  input.runId,
                  'step',
                  `Completed: ${s.label.slice(0, 120)}`,
                  {
                    stepKey: s.stepKey,
                    ok: true,
                    detail: s.evidence?.summary,
                  },
                );
                yield {
                  type: 'step_completed',
                  stepKey: s.stepKey,
                  label: s.label,
                  evidence: s.evidence,
                  log: stepLog,
                };
              }
            }
          }
        }
        yield* flushReasoning();
      } catch (err) {
        logger.error({ err, runId: input.runId }, 'workflow agent execution failed');
        const message = err instanceof Error ? err.message : 'Workflow agent failed';
        const log = await emitAndLog(
          input.runId,
          'error',
          message,
          {},
          { agentStatus: 'failed', agentSummary: message },
        );
        yield { type: 'error', code: 'AGENT_FAILED', message, log };
      }

      run = await workflows.getRun(input.workspaceId, input.userId, input.runId, input.role);
    } else if (stillPending.length > 0 && !completionAvailable()) {
      const log = await emitAndLog(
        input.runId,
        'status',
        'AI agent is not configured, so only simple “open a website” steps can run automatically.',
        {
          detail: `Still open:\n${stillPending.map((s) => `• ${s.label}`).join('\n')}`,
        },
      );
      yield { type: 'status', message: log.message, log };
    }

    run = await workflows.getRun(input.workspaceId, input.userId, input.runId, input.role);
    const left = run.steps.filter((s) => s.status === 'pending').length;
    const summary =
      left === 0
        ? 'All steps completed.'
        : `${left} step(s) still need you or a login — see Activity for details.`;
    const log = await emitAndLog(
      input.runId,
      'done',
      summary,
      {
        detail:
          left > 0
            ? run.steps
                .filter((s) => s.status === 'pending')
                .map((s) => `• ${s.label}`)
                .join('\n')
            : undefined,
      },
      {
        agentStatus: left === 0 ? 'completed' : 'completed',
        agentSummary: summary,
      },
    );
    yield { type: 'status', message: summary, log };
    yield { type: 'done', run, log };
  } finally {
    await closeBrowserSession(sessionKey).catch(() => undefined);
  }
}
