/** Live status lines for chat SSE `tool_call.statusLabel` (product UX). */
export const TOOL_STATUS_LABELS: Record<string, string> = {
  list_library_documents: 'Listing Library…',
  get_document_summary: 'Loading document…',
  search_library: 'Searching Library…',
  web_search: 'Searching the web…',
  list_meetings: 'Listing meetings…',
  get_meeting_summary: 'Loading meeting…',
  search_meetings: 'Searching meetings…',
  list_work_items: 'Listing work items…',
  get_work_item: 'Loading work item…',
  list_workflows: 'Listing workflows…',
  get_workflow: 'Loading workflow…',
  get_my_workflow_progress: 'Checking your workflow progress…',
  complete_workflow_step: 'Marking step complete…',
};

export function getMastraToolStatusLabel(name: string): string {
  return TOOL_STATUS_LABELS[name] ?? `Running ${name}…`;
}
