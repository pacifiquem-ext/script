import { Agent } from '@mastra/core/agent';
import { CHAT_MODEL } from '@script/shared';
import { env } from '../../config/env';
import { browserTools } from '../tools/browser';
import {
  completeWorkflowStepTool,
  getMyWorkflowProgressTool,
  getWorkflowTool,
} from '../tools/workflows';

export const WORKFLOW_EXECUTOR_AGENT_ID = 'workflow-executor';

export const WORKFLOW_EXECUTOR_SYSTEM_PROMPT = `You are script’s workflow execution agent. You carry out plain-English checklist steps using browser tools (Playwright-like) and then mark steps complete with real evidence.

Tools:
- browser_navigate — open a URL or domain
- browser_snapshot — read page title, URL, and visible text
- browser_click — click by selector or visible text
- browser_type — type into fields
- browser_press — keyboard keys
- browser_wait — wait for text or a short delay
- get_my_workflow_progress / get_workflow — inspect remaining steps
- complete_workflow_step — WRITE only after you performed the step; must include evidence

Rules:
1. Work pending steps in order. For each step, interpret the label and guidance as an instruction to execute (e.g. “Go to Github.com” → browser_navigate to https://github.com).
2. Prefer browser tools for web tasks. After actions, call browser_snapshot to verify success (correct domain, expected title/content).
3. Only call complete_workflow_step when you have evidence. Include method agent_browser, a clear summary, finalUrl when applicable, and key actions.
4. Never mark a step done without doing the work. Never invent success.
5. If a step cannot be automated (offline human-only work like “ask your manager”), leave it pending and explain why in your final message — do not self-attest.
6. Do not ask the user to click Confirm for browser-capable steps; execute them yourself.
7. Be efficient: navigate once, verify, complete, move on.`;

function resolveMastraModel(): string {
  if (env.COMPLETION_PROVIDER === 'openai_compatible' && env.COMPLETION_MODEL) {
    return `openai/${env.COMPLETION_MODEL}`;
  }
  const model = env.COMPLETION_MODEL?.trim() || CHAT_MODEL;
  if (model.includes('/')) return model;
  return `anthropic/${model}`;
}

export const workflowExecutorAgent = new Agent({
  id: WORKFLOW_EXECUTOR_AGENT_ID,
  name: 'Workflow Executor',
  description:
    'Executes markdown workflow checklist steps with Playwright browser tools and evidence-backed completion.',
  instructions: WORKFLOW_EXECUTOR_SYSTEM_PROMPT,
  model: resolveMastraModel(),
  tools: {
    browser_navigate: browserTools.browserNavigateTool,
    browser_snapshot: browserTools.browserSnapshotTool,
    browser_click: browserTools.browserClickTool,
    browser_type: browserTools.browserTypeTool,
    browser_press: browserTools.browserPressTool,
    browser_wait: browserTools.browserWaitTool,
    get_workflow: getWorkflowTool,
    get_my_workflow_progress: getMyWorkflowProgressTool,
    complete_workflow_step: completeWorkflowStepTool,
  },
});
