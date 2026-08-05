/** Re-export Mastra-backed web search (ADR 0017 / @mastra/tavily). */
export {
  setWebSearchForTests,
  webSearch,
  type WebSearchFn,
  type WebSearchResult,
} from '../../../mastra/tools/web-search';
