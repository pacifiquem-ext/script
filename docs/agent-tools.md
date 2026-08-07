# Agent tools — how script becomes aware of its environment

**Status: shipped (Library + meetings + work items + workflows + web).** Runtime is **Mastra** (ADR 0017).
Domain services remain in `server/src/modules/*`; tools are Mastra `createTool` wrappers.

**Platform:** [Mastra](https://mastra.ai/) — see [`docs/research/mastra-baseline.md`](./research/mastra-baseline.md),
[`docs/adr/0017-mastra-agent-baseline.md`](./adr/0017-mastra-agent-baseline.md), `AGENTS.md` §2.7,
skills: `.agents/skills/mastra` + `.agents/skills/script-mastra`.

The company-brain thesis is that the assistant should never say "I can't see that" about something
the workspace owns. The way it stops saying that is **tools**.

---

## 1. What ships today

| Tool                     | Source                                        | What it answers                               |
| ------------------------ | --------------------------------------------- | --------------------------------------------- |
| `list_library_documents` | `mastra/tools/library.ts`                     | Library inventory                             |
| `get_document_summary`   | `mastra/tools/library.ts`                     | One document by id or name                    |
| `search_library`         | `mastra/tools/library.ts`                     | Semantic document search                      |
| `list_meetings`          | `mastra/tools/meetings.ts`                    | Meeting inventory                             |
| `get_meeting_summary`    | `mastra/tools/meetings.ts`                    | One meeting                                   |
| `search_meetings`        | `mastra/tools/meetings.ts`                    | Transcript search                             |
| `list_work_items`        | `mastra/tools/work-items.ts`                  | Work-item inventory                           |
| `get_work_item`          | `mastra/tools/work-items.ts`                  | One work item (live GitHub when connected)    |
| `list_workflows`         | `mastra/tools/workflows.ts`                   | Workflow catalog                              |
| `get_workflow`           | `mastra/tools/workflows.ts`                   | One workflow’s steps                          |
| `get_my_workflow_progress` | `mastra/tools/workflows.ts`                 | Assignee progress / what’s next               |
| `complete_workflow_step` | `mastra/tools/workflows.ts`                   | Write: chat requires HITL confirm; executor skipHitl |
| `web_search`             | `mastra/tools/web-search.ts` (@mastra/tavily) | External/public facts; needs `TAVILY_API_KEY` |

---

## 2. Runtime shape

```text
chat-service / agent-entry
  └── getAgentRunner() → runAgentWithTools (production) | defaultTestAgentRunner (test)
        ├── inventory hard-route (library / meetings)
        └── companyBrainAgent.stream (Mastra)
              ├── createTool execute → domain services + RequestContext tenancy
              └── SSE mapper → tool_call / tool_result / delta / citations
```

Compat: `register-compat-tools.ts` also registers the same tools on the ADR 0011 registry so
`executeTool` / tests keep working.

---

## 3. How to add a tool

1. Prefer an existing Mastra first-party package if the capability is generic (search, crawl, MCP).
2. Otherwise `createTool` in `server/src/mastra/tools/` with Zod schemas.
3. Read tenancy only from `toolContextFromRequestContext(requestContext)`.
4. Attach on `companyBrainAgent` in `agents/company-brain.ts`.
5. Add status label in `status-labels.ts`.
6. Ensure compat registry lists the tool (`Object.values(companyBrainTools)`).
7. Tests for execute + clearance; chat SSE contract if new event shapes.

---

## 4. Multi-agent

See `server/src/mastra/multi-agent.md`. Default is **one** company-brain agent; supervisors only
when tool sprawl justifies them.
