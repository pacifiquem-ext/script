import { registerBuiltinTools } from './register-builtin-tools';

registerBuiltinTools();

export { registerBuiltinTools } from './register-builtin-tools';

export { buildDocumentSummary } from './document-summary';
export {
  getAgentRunner,
  setAgentRunnerForTests,
  setAnthropicMessagesCreateForTests,
  runAgentWithTools,
  defaultTestAgentRunner,
  AGENT_SYSTEM_PROMPT,
  type AgentRunInput,
  type AgentRunner,
  type AgentStreamEvent,
} from './agent-runtime';
export { isLibraryInventoryIntent } from './library-intent';
export {
  classifyInventoryIntent,
  classifyInventoryIntentHeuristicForTests,
} from './inventory-intent';
export {
  listLibraryDocuments,
  getLibraryDocument,
  searchLibrary,
  type LibraryToolContext,
} from './library-tools';
export {
  executeAgentTool,
  AGENT_TOOL_DEFINITIONS,
  getAgentToolDefinitions,
} from './tool-definitions';
export {
  registerTool,
  executeTool,
  getToolDefinitions,
  getToolStatusLabel,
  listRegisteredToolNames,
  type AgentToolContext,
  type ToolExecutionResult,
} from './registry';
export { setWebSearchForTests, webSearch } from './web-search';
