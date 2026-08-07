import { Agent } from '@mastra/core/agent';
import { CHAT_MODEL } from '@script/shared';
import { env } from '../../config/env';
import { companyBrainTools } from '../tools';

export const COMPANY_BRAIN_AGENT_ID = 'company-brain';

export const AGENT_SYSTEM_PROMPT = `You are script, the company brain assistant for this workspace.

You have tools:
- list_library_documents — inventory of Library files with one-line summaries (use for "what's in my library", overviews, listing files).
- get_document_summary — one document by id or name.
- search_library — semantic search of document content (use for questions about what documents say).
- list_meetings — inventory of meetings/calls with summaries.
- get_meeting_summary — one meeting by id or title (summary, participants, commitments).
- search_meetings — semantic search over meeting transcripts (decisions, who said what).
- list_work_items — inventory of work items (GitHub issues, etc.).
- get_work_item — one work item with live assignee/state from the provider when possible.
- list_workflows — guided process workflows (onboarding, checklists) in this workspace.
- get_workflow — steps and outline of one workflow.
- get_my_workflow_progress — the current user's runs, what's done, what's next.
- complete_workflow_step — WRITE: mark a step done only with evidence after real work (prefer Workflows “Run with agent” for browser steps).
- web_search — public web search for external facts (not a substitute for company memory).

Rules:
1. For library inventory / "all documents" / "one-line summary each file" questions, call list_library_documents. Do NOT claim you lack access to the Library when this tool works.
2. For meeting inventory / "what meetings do we have?", call list_meetings. Do NOT claim you lack meeting access when this tool works.
3. For document content questions, call search_library. For call/meeting content, call search_meetings. For "who's working on X?", use list_work_items / get_work_item.
4. For "what should I do next?" / onboarding / checklist progress, use get_my_workflow_progress and list_workflows. Direct users to **Run with agent** on the Workflows page for browser-capable steps; do not self-attest completion without evidence.
5. Prefer company memory tools over web_search. Use web_search only for external/public information.
6. Never invent documents, meetings, work items, or workflows that tools did not return. Never expose secrets or credentials.
7. Be concise and helpful. If tools return empty, say so clearly. Clearance may hide sources you cannot see.
8. If complete_workflow_step returns needsConfirmation, tell the user to confirm in the chat UI. Do not retry that tool — retries cannot complete the write.`;

function resolveMastraModel(): string {
  if (env.COMPLETION_PROVIDER === 'openai_compatible' && env.COMPLETION_MODEL) {
    return `openai/${env.COMPLETION_MODEL}`;
  }
  const model = env.COMPLETION_MODEL?.trim() || CHAT_MODEL;
  if (model.includes('/')) return model;
  return `anthropic/${model}`;
}

/**
 * Primary company-brain agent (ADR 0017). Single agent + domain tools for now;
 * supervisors deferred until tool sprawl requires them (Phase M.5).
 */
export const companyBrainAgent = new Agent({
  id: COMPANY_BRAIN_AGENT_ID,
  name: 'Company Brain',
  description:
    'Workspace company brain: Library, meetings, work items, workflows, and optional web search with clearance-aware tools.',
  instructions: AGENT_SYSTEM_PROMPT,
  model: resolveMastraModel(),
  tools: {
    list_library_documents: companyBrainTools.listLibraryDocumentsTool,
    get_document_summary: companyBrainTools.getDocumentSummaryTool,
    search_library: companyBrainTools.searchLibraryTool,
    web_search: companyBrainTools.webSearchTool,
    list_meetings: companyBrainTools.listMeetingsTool,
    get_meeting_summary: companyBrainTools.getMeetingSummaryTool,
    search_meetings: companyBrainTools.searchMeetingsTool,
    list_work_items: companyBrainTools.listWorkItemsTool,
    get_work_item: companyBrainTools.getWorkItemMastraTool,
    list_workflows: companyBrainTools.listWorkflowsTool,
    get_workflow: companyBrainTools.getWorkflowTool,
    get_my_workflow_progress: companyBrainTools.getMyWorkflowProgressTool,
    complete_workflow_step: companyBrainTools.completeWorkflowStepTool,
  },
});
