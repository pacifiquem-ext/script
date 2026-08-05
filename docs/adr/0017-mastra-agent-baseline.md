# ADR 0017 — Mastra as agent platform baseline

## Status

Accepted — 2026-08-05

## Context

script’s company-brain agent loop lived in a hand-rolled Anthropic tool loop
(`server/src/modules/chat/agent/agent-runtime.ts`) plus a custom tool registry
(ADR 0011). Research in [`docs/research/mastra-baseline.md`](../research/mastra-baseline.md)
and owner direction (`AGENTS.md` §2.7) adopt **[Mastra](https://mastra.ai/)** so we
stop reinventing agent loops, multi-agent supervisors, MCP, first-party search tools,
and AI workflow graphs.

## Decision

1. **Mastra is the agent runtime** for chat and non-conversation entry
   (`handleAgentAskWithoutConversation` / Slack). Domain services stay in
   `server/src/modules/*`; tools are **`createTool` wrappers** over those services.

2. **In-process library usage** (recommended): call `Agent.stream` / `generate` from
   product routes. Do **not** replace Fastify product auth with Mastra HTTP as the
   customer chat API. Optional `@mastra/fastify` mounts only behind our auth and a
   non-colliding prefix (deferred until needed for Studio).

3. **RequestContext** carries tenancy and clearance (`workspaceId`, `userId`,
   `maxClearanceLevel`, `elevated`, `conversationId`). Tools never trust model-supplied
   workspace ids.

4. **Keep product RAG / clearance**: MemoryChunk + `vector.ts` filters; no generic
   Mastra `PgVector` path for Library without clearance.

5. **Web search**: use `@mastra/tavily` client (`getTavilyClient`) inside a Mastra
   `createTool` with product id `web_search` (stable SSE + tests). Env: `TAVILY_API_KEY`.

6. **Conversation memory**: stay on Prisma `Conversation` / `Message` for now. Defer
   Mastra Memory dual-write.

7. **Node engines**: bump monorepo to **`node >= 22.13.0`** (Mastra package requirement).
   Local Node 24 is fine.

8. **Module system**: server remains **CommonJS**; Mastra ships dual CJS builds
   (`dist/*.cjs`) that `require()` correctly. No full ESM migration required for Phase M.

9. **Defer**: Mastra Slack channels, EE packages, Mastra Memory for product chat, Voyage
   client swap (`@mastra/voyageai`) until separate evaluation.

10. **Product SSE contract** unchanged: mapper converts Mastra stream chunks →
    `tool_call` / `tool_result` / `delta` / `citations`.

11. **C7 workflows**: prefer Mastra `createWorkflow` as execution engine under product
    Workflow entities when Phase 7 ADR is written — do not invent a second graph runner.

## Consequences

- New code under `server/src/mastra/`; thin adapter in `chat/agent/`.
- ADR 0011 registry remains as a **compat bridge** for tests/`executeTool` until fully
  retired; production loop is Mastra.
- Coding agents must follow `AGENTS.md` §2.7 and `.agents/skills/mastra/`.
