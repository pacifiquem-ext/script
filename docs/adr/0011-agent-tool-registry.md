# ADR 0011 — Agent tool registry

## Status

Accepted — 2026-08-03

## Context

Adding a tool required hand-syncing definitions, dispatch, the test runner, system prompt mentions,
and ChatPage status labels (`docs/agent-tools.md` §3). Phase 1 of the capability roadmap makes
tool growth cheap before meetings and connectors land.

## Decision

1. **Single registry** — `registerTool({ definition, execute, statusLabel })` in
   `server/src/modules/chat/agent/registry.ts`. Definitions and dispatch are derived from the map.
2. **Import-side registration** — each domain module (library, web, meetings, …) calls
   `registerTool` at load time from a single bootstrap import in `agent/index.ts`.
3. **Status labels on the wire** — `tool_call` SSE events include `statusLabel` so the client does
   not hardcode tool names.
4. **DB audit rows** — each tool execution writes `AgentToolCall` (workspace, user, tool, ok,
   durationMs, optional error). Pino `agent_tool_audit` remains for ops dashboards.
5. **Test runner** — uses `executeTool` from the registry; inventory hard-route stays.

## Consequences

- New tools are one module + `registerTool` + tests; no switch statement growth.
- Client ChatPage uses `event.statusLabel` with a generic fallback.
- Compliance can query `AgentToolCall` without scraping logs.
