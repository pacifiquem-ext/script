# Agent tools — how script becomes aware of its environment

**Status: shipped (Library + web).** This document describes the tool-use runtime that exists in
`server/src/modules/chat/agent/` today, and the contract for adding the next tool.

The company-brain thesis is that the assistant should never say "I can't see that" about something
the workspace owns. The way it stops saying that is **tools**: every new area of company truth
(Library, calls, channels, work items, workflows) enters the brain as one or more tools the model
can call. `product_path.txt` states this as a standing rule — _"we must keep defining more tools so
that the app is aware of its environment the same way we did for the library."_ This file is the
mechanism for that rule.

---

## 1. What ships today

| Tool                     | Source                   | What it answers                                        |
| ------------------------ | ------------------------ | ------------------------------------------------------ |
| `list_library_documents` | `library-tools.ts`       | "What's in my library?", inventory, find by name       |
| `get_document_summary`   | `library-tools.ts`       | One document by id or exact name + preview             |
| `search_library`         | `library-tools.ts`       | Semantic content questions over current-version chunks |
| `web_search`             | `web-search.ts` (Tavily) | External/public facts; requires `TAVILY_API_KEY`       |

Everything else in `product_path.txt` — calls, Slack/Teams/WhatsApp channels, Notion/Jira/GitHub
work items, workflows — has **no tool yet**. See [`connectors.md`](./connectors.md) and
[`workflows.md`](./workflows.md) for the specs those tools will implement.

## 2. Runtime shape

```text
chat-service.ts
  └── getAgentRunner()                    agent-runtime.ts
        ├── isLibraryInventoryIntent()    hard route → forced list_library_documents
        └── runAgentWithTools()           Anthropic tool loop, max 6 rounds
              └── executeAgentTool()      tool-definitions.ts (switch dispatch)
```

- **Loop**: `runAgentWithTools` calls Anthropic with `AGENT_TOOL_DEFINITIONS`. While
  `stop_reason === 'tool_use'`, it executes each requested tool, appends `tool_result` blocks, and
  goes again. `DEFAULT_MAX_ROUNDS = 6`; on exhaustion it makes one final tool-free call.
- **Hard route**: inventory phrasing is matched by `library-intent.ts` and answered directly from
  `list_library_documents` without a model round trip. This exists because catalog questions used to
  produce false "I have no access to your library" answers. **Any new capability with the same
  failure mode should get the same treatment** — a deterministic path, not a hope that the model
  picks the right tool.
- **Streaming**: the loop yields `tool_call`, `tool_result`, `delta`, and `citations` events, which
  `chat-service` forwards over SSE. The client (`client/src/lib/chat-api.ts` → `ChatPage.tsx`)
  turns them into the live status line ("Searching Library…", "Searching the web…").
- **Audit**: `logToolAudit()` emits a structured `agent_tool_audit` Pino line per call
  (workspace, user, tool, ok, durationMs). **Logs only — there is no audit table.**
- **Test seams**: `setAgentRunnerForTests`, `setAnthropicMessagesCreateForTests`,
  `setWebSearchForTests`. In `NODE_ENV=test` the runner defaults to `defaultTestAgentRunner`, a
  deterministic runner that mirrors the production routing without calling Anthropic.

## 3. Adding a tool (the current checklist)

Adding one tool touches **four** places. Miss any of them and the tool either never runs or never
gets tested.

1. **Implementation** — a module under `server/src/modules/<domain>/` (or
   `chat/agent/<domain>-tools.ts`) exporting plain async functions. It must take the tool context
   and **enforce workspace scoping in the query itself**, never trust the model's arguments for
   tenancy.
2. **Definition** — append an `Anthropic.Messages.Tool` to `AGENT_TOOL_DEFINITIONS` in
   `tool-definitions.ts`. The `description` is prompt engineering: say what it answers, what it does
   _not_ return, and when to prefer a sibling tool.
3. **Dispatch** — add a `case` to `executeAgentTool`. Coerce every input defensively (the model can
   send anything), return `{ ok, data }`, and attach `citations` if the result is groundable.
4. **Test runner + tests** — extend `defaultTestAgentRunner` so the path is reachable without a live
   model, and add coverage in `server/test/agent-tools.test.ts` / `agent-runtime.test.ts`.

Then: mention it in `AGENT_SYSTEM_PROMPT` rules, and add a client-side status label in `ChatPage.tsx`
so the user sees what the brain is doing.

## 4. Known gaps (fix before the tool count grows)

These are the reasons "keep defining more tools" is currently harder than it should be. They are
tracked in `TODO.md` under **T0 — Tool platform**.

- **No registry.** Definition, dispatch, and the test runner are three hand-synced lists. A
  `registerTool({ definition, execute, testFixture })` registry with one import site would make each
  new connector a single file instead of a four-file edit.
- **No clearance at the tool boundary.** `LibraryToolContext` carries `workspaceId` (+ optional
  `userId`). Once documents/channels/connectors have finer ACLs, filtering must happen _inside_ each
  tool, and the context must carry the caller's clearance. Designing that after ten tools exist is
  significantly worse than designing it now.
- **Audit is logs, not rows.** Compliance questions ("what did the brain read about me?") need
  queryable rows, not Pino output.
- **No per-tool cost/credit accounting.** Credits are charged per assistant turn, not per tool call.
  Connector tools that hit paid third-party APIs will need their own accounting.
- **Result size**: tool payloads are truncated at 80,000 characters before being handed back to the
  model. High-volume connectors (a busy Slack channel, a Jira project) must paginate and summarize
  server-side rather than relying on truncation.
- **Single tool surface**: tools are only reachable from in-app chat. The messaging bots in
  [`connectors.md`](./connectors.md) need the same runtime callable from a webhook context with no
  `Conversation` row — plan the entry point, don't fork the loop.

## 5. Rules

- A tool is **read-only** unless an ADR says otherwise. Write-capable tools (create a Jira ticket,
  post to a channel, mark a workflow step done) need explicit scoping, an allowlist, and user
  confirmation UX — see `AGENTS.md` §15.
- Never return raw secrets, tokens, or another workspace's rows from a tool, even if the model asks.
- A tool that can return nothing must say so in its result (`{ ok: true, data: { items: [] } }`), so
  the model reports "nothing found" instead of inventing content. See `AGENT_SYSTEM_PROMPT` rule 4.
- Tool descriptions are user-visible in effect (they steer answers). Keep them in the product's
  language — see `CONTEXT.md`.
