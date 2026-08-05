---
name: script-mastra
description: How script embeds Mastra as the company-brain agent runtime (ADR 0017). Use when adding agent tools, changing chat/Slack agent entry, or choosing Mastra vs custom code.
---

# script × Mastra (project skill)

**Always load the official `mastra` skill** for framework API facts. This skill is the
**product-specific** overlay for the script monorepo.

## Rules (non-negotiable)

1. **Mastra-first** — `AGENTS.md` §2.7. Before inventing agent loops, web search clients, MCP
   bridges, multi-agent supervisors, or AI workflow graphs: check Mastra.
2. **Domain stays ours** — clearance, Library/MemoryChunk, credits, JWT/workspace. Implement as
   `createTool` **execute** bodies that call `server/src/modules/*` services.
3. **Tenancy via RequestContext** — set `workspaceId`, `userId`, `maxClearanceLevel`, `elevated`
   in `server/src/mastra/request-context.ts`. Never trust model-supplied workspace ids.
4. **In-process agents** — chat/Slack call `companyBrainAgent.stream` / mapper. Do not put
   unauthenticated Mastra HTTP on the public chat API.

## Layout

```text
server/src/mastra/
  index.ts                 # Mastra instance
  agents/company-brain.ts  # primary agent
  tools/                   # createTool wrappers
  request-context.ts
  register-compat-tools.ts # ADR 0011 registry bridge for executeTool / tests
  multi-agent.md           # when to add supervisors
```

## Adding a tool

1. Implement domain service under `modules/` if needed (clearance inside service).
2. Add `createTool` in `server/src/mastra/tools/`.
3. Attach on `companyBrainAgent.tools`.
4. Compat registry picks it up via `register-compat-tools` (or extend that list).
5. Add status label in `status-labels.ts`.
6. Tests: unit for RequestContext fail-closed; optional chat stream via existing SSE contract.

## References

- ADR 0017: `docs/adr/0017-mastra-agent-baseline.md`
- Research: `docs/research/mastra-baseline.md`
- TODO Phase M: `TODO.md`
- Official skill: `.agents/skills/mastra/`
