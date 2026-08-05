import { getDocumentSummaryTool, listLibraryDocumentsTool, searchLibraryTool } from './library';
import { getMeetingSummaryTool, listMeetingsTool, searchMeetingsTool } from './meetings';
import { webSearchTool } from './web-search';
import { getWorkItemMastraTool, listWorkItemsTool } from './work-items';
import {
  completeWorkflowStepTool,
  getMyWorkflowProgressTool,
  getWorkflowTool,
  listWorkflowsTool,
} from './workflows';

/** All company-brain domain tools registered on the Mastra agent. */
export const companyBrainTools = {
  listLibraryDocumentsTool,
  getDocumentSummaryTool,
  searchLibraryTool,
  webSearchTool,
  listMeetingsTool,
  getMeetingSummaryTool,
  searchMeetingsTool,
  listWorkItemsTool,
  getWorkItemMastraTool,
  listWorkflowsTool,
  getWorkflowTool,
  getMyWorkflowProgressTool,
  completeWorkflowStepTool,
};

export {
  listLibraryDocumentsTool,
  getDocumentSummaryTool,
  searchLibraryTool,
  webSearchTool,
  listMeetingsTool,
  getMeetingSummaryTool,
  searchMeetingsTool,
  listWorkItemsTool,
  getWorkItemMastraTool,
  listWorkflowsTool,
  getWorkflowTool,
  getMyWorkflowProgressTool,
  completeWorkflowStepTool,
};
