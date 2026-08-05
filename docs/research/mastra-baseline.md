# Mastra baseline research (script adoption)

**Status:** research complete; **owner direction is to adopt** (see `AGENTS.md` §2.7 + `TODO.md`
Phase M). This file is **not** an ADR — ADR 0017 is the decision record when implementation starts.  
**Date:** 2026-08-05  
**Primary sources:** [mastra.ai](https://mastra.ai/), [mastra.ai/docs](https://mastra.ai/docs), [github.com/mastra-ai/mastra](https://github.com/mastra-ai/mastra) (README, packages, LICENSE).  
**Audience:** agents adopting Mastra for the script company-brain monorepo (`client/` + `server/` + `packages/shared`).

**Canonical build checklist:** `TODO.md` **Phase M** (M.0–M.7). Section 9 below is the same
adoption story in research numbering — prefer Phase M IDs when updating the ledger.

---

## 1. What Mastra is

**Positioning.** Mastra is an open-source **TypeScript framework for AI agents and AI-powered applications**. Official copy: *“Build, observe, and improve agents… the leading TypeScript agent framework”* ([mastra.ai](https://mastra.ai/), [GitHub README](https://github.com/mastra-ai/mastra)). It targets production agents (tools, memory, workflows, multi-agent, channels, observability, evals), not a single-vendor chat SDK.

**What it ships (product surface):**

| Surface | Role |
| --- | --- |
| **Agents** | LLM + tools loop until final answer or stop condition |
| **Workflows** | Graph-based multi-step orchestration (`.then` / `.branch` / `.parallel`) |
| **Memory** | Thread history, working memory, semantic recall, observational memory |
| **Harness / AgentController** | Multi-mode collaborative session runtime (modes, permissions, subagents) |
| **Mastra instance + server** | Registry of agents/workflows/MCP; standalone or framework-mounted HTTP API |
| **Observability + evals** | Traces, metrics, logs, feedback, scorers, datasets |
| **MCP** | Client (consume remote tools) + Server (expose Mastra primitives) |
| **RAG** | Document chunk/embed + vector store APIs (`@mastra/rag`, store packages) |
| **Channels / signals** | Slack/Teams/etc. messaging; GitHub PR event signals for long-running agents |
| **Model router** | `"provider/model"` string → 100s of models / 40–168 providers (docs vary by page age) |

**License (dual model)** — [LICENSE.md](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md), [README Licensing](https://github.com/mastra-ai/mastra):

- **Apache-2.0** — core framework and the vast majority of the monorepo.
- **Mastra Enterprise License** — anything under a directory named `ee/` (e.g. `packages/core/src/auth/ee/`). Source-available; free for **development/testing**; production use requires an enterprise license.
- Copyright: Kepler Software, Inc. (Apache header).

**TypeScript-first.** All public APIs are TS. Schema inputs use Standard JSON Schema libraries (Zod / Valibot / ArkType). Package layout is a large pnpm monorepo (`@mastra/core`, `@mastra/memory`, `@mastra/pg`, `@mastra/fastify`, …). YC W25 company ([badge on README](https://github.com/mastra-ai/mastra)).

**Greenfield path:** `npm create mastra@latest` → Studio at `http://localhost:4111`.  
**Brownfield path (what we need):** manual install / `mastra init` + **server adapters** ([manual install](https://mastra.ai/guides/getting-started/manual-install), [server adapters](https://mastra.ai/docs/server/server-adapters)).

---

## 2. Core primitives

### 2.1 `Agent` (`@mastra/core/agent`)

```ts
import { Agent } from '@mastra/core/agent';

export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  instructions: `You are a helpful weather assistant.`,
  model: 'openai/gpt-5.5', // or anthropic/…; provider/model router
  tools: { weatherTool },
});
```

Docs: [Agents overview](https://mastra.ai/docs/agents/overview).

- **`.generate()`** — full response after tool steps (`text`, `toolCalls`, `toolResults`, `steps`, `usage`).
- **`.stream()`** — token/event stream (`textStream`, full event iterator, `usage`, `finishReason`).
- Prefer **`mastra.getAgentById()`** so the agent gets instance storage, logging, observability, registry.
- Expandable: tools, memory, structured output, approval (HITL), processors, guardrails, voice, channels, dynamic config via `RequestContext`.

### 2.2 `createTool` / tools (`@mastra/core/tools`)

Docs: [Using tools](https://mastra.ai/docs/agents/using-tools), [createTool reference](https://mastra.ai/reference/tools/create-tool).

```ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const weatherTool = createTool({
  id: 'weather-tool',
  description: 'Fetches weather for a location',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({
    location: z.string(),
    temperatureCelsius: z.number(),
    conditions: z.string(),
  }),
  execute: async ({ location }, { abortSignal }) => {
    /* … */
  },
});
```

**Important capabilities for script:**

| Feature | Purpose for us |
| --- | --- |
| `inputSchema` / `outputSchema` | Replaces hand-written Anthropic tool JSON schemas |
| `toModelOutput` | Shrink tool result for the model; keep full result for app/UI |
| `transform` | Shape tool I/O for display/transcript (separate from model payload) |
| `requireApproval` | HITL before sensitive tools run |
| `hooks` (`beforeToolCall` / `afterToolCall`) | Audit, policy blocks, clearance guards at agent level |
| Lifecycle stream hooks | `onInputStart` / `onInputDelta` / `onInputAvailable` / `onOutput` for status lines |
| `context.writer` | Emit custom stream events from tool execution |
| Agents-as-tools / workflows-as-tools | Multi-agent & orchestration composition |

Built-in provider tools (from tools docs): **`webSearchTool`** (provider-native search: OpenAI, Anthropic, Gemini, xAI), **`webFetchTool`**. Third-party packages: `@mastra/tavily`, Bright Data, Perplexity, Firecrawl guides.

### 2.3 Workflows (`@mastra/core/workflows`)

Docs: [Workflows overview](https://mastra.ai/docs/workflows/overview).

- `createStep({ id, inputSchema, outputSchema, execute })`
- `createWorkflow({ id, inputSchema, outputSchema }).then(step).commit()`
- Control flow: `.then()`, `.branch()`, `.parallel()` ([control flow](https://mastra.ai/docs/workflows/control-flow))
- **Suspend/resume** for HITL; storage persists execution state indefinitely
- Nested workflows as steps; `cloneWorkflow`
- Run: `createRun()` → `.start({ inputData })` or `.stream({ inputData })`
- Result statuses: `success` | `failed` | `suspended` | `tripwire` | `paused`
- Optional external runners (e.g. Inngest) via [workflow runners](https://mastra.ai/docs/deployment/workflow-runners)
- Steps can call agents/tools; agent `textStream` can pipe into step `writer`

**Fit for script:** product “workflows” in `docs/workflows.md` (markdown-authored guided processes) can map later to Mastra workflows; do **not** conflate Mastra workflows with company-brain workflow product until an ADR.

### 2.4 Memory (`@mastra/memory`)

Docs: [Memory overview](https://mastra.ai/docs/memory/overview).

Layers:

1. **Message history** — last N messages per `resource` + `thread`
2. **Observational Memory** — background compression of old turns into dense observations (recommended for long threads)
3. **Working memory** — structured persistent user/entity facts
4. **Semantic recall** — vector retrieval of past messages (`topK`)
5. **Memory processors** — trim when context overflows

Requires a **storage** provider (`LibSQLStore`, `PostgresStore`, …). Call-time:

```ts
await agent.generate('…', {
  memory: { resource: 'user-123', thread: 'conversation-123' },
});
```

**Multi-agent isolation:** subagent delegation gets fresh `threadId`, resource `{parentResourceId}-{agentName}`; resource-scoped memory can still share working/semantic memory across agents with same `resource`.

**Not the same as script “company memory”.** Mastra Memory = *conversation/agent state*. Script Library / `MemoryChunk` / DocumentVersion = *tenant knowledge base*. Keep product RAG in our Prisma/pgvector path; use Mastra Memory only for chat threads if we migrate off our `Conversation`/`Message` tables (or dual-write carefully).

### 2.5 Harness / AgentController

Marketing site still says **Harness** (`@mastra/core/harness` in homepage snippets). Current docs emphasize **`AgentController`** (`@mastra/core/agent-controller`) as beta: multi-mode collaborative session host ([AgentController](https://mastra.ai/docs/harness/agent-controller)).

Controller coordinates:

- Modes (plan/build/… with different instructions/tools)
- Model switching per session/thread
- Tool permission policies (`ask` / `deny` / category grants)
- Subagent definitions with tool allowlists
- Channels, workspace filesystem tools
- Sessions (live) vs threads (durable)

**Fit for script:** optional later for long-running coding/ops copilots. **Not required** for company-brain chat turn. Prefer plain `Agent` for chat SSE path.

### 2.6 MCP (`@mastra/mcp`)

Docs: [MCP overview](https://mastra.ai/docs/mcp/overview) (also linked as tools-mcp).

- **`MCPClient`** — connect to local (`command`/`npx`) or remote HTTP MCP servers; `listTools()` (static) or `listToolsets()` (per-request multi-tenant credentials)
- **`MCPServer`** — expose agents, tools, workflows to MCP clients; register on `Mastra` via `mcpServers`
- OAuth support for protected servers
- `requireToolApproval` on MCP tools
- MCP Apps (interactive HTML UIs in Studio)

### 2.7 Mastra instance + server

```ts
import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  agents: { weatherAgent },
  workflows: { shippingWorkflow },
  storage: /* LibSQLStore | PostgresStore | Composite */,
  observability: /* optional Observability */,
  server: { port: 4111 }, // used by mastra build/dev; adapters ignore most of this
});
```

- Greenfield: `mastra dev` / `mastra build` (Hono-based default server + Studio).
- Brownfield: **do not replace Fastify** — use **server adapters** (§5).

### 2.8 Observability & evals

Docs: [Observability overview](https://mastra.ai/docs/observability/overview), [Evals](https://mastra.ai/docs/evals/overview).

- Package: `@mastra/observability` (+ storage: DuckDB/ClickHouse for metrics; LibSQL/PG for traces)
- Spans for agent/workflow/tool/LLM steps; auto metrics (latency, tokens, cost)
- Log correlation via trace/span IDs
- Feedback API; exporters: Mastra storage, Mastra Platform, Langfuse, Arize, OTEL-compatible
- Evals: `createScorer`, prebuilt rubric scorers (`@mastra/evals`), datasets/experiments domains in storage
- Supervisor **isTaskComplete** can use scorers to force continue until rubric passes

### 2.9 RAG

Docs: [RAG overview](https://mastra.ai/guides/rag/overview) (also `/docs/rag/overview` in older links).

Pipeline primitives:

1. `MDocument.fromText(…)` → `.chunk({ strategy, size, overlap })` (`@mastra/rag`)
2. Embed via AI SDK `embedMany` + `ModelRouterEmbeddingModel` or `@mastra/voyageai`
3. Store/query: `PgVector` from `@mastra/pg` (also Pinecone, Qdrant, Chroma, … under `stores/*`)
4. `createVectorQueryTool` for agent-facing retrieval (+ optional Voyage reranker)

**script already has** precompute-at-ingest RAG (ADR 0001), Voyage 1024-d (ADR 0002), Prisma + `server/src/db/vector.ts` only. **Do not** re-ingest Library into Mastra’s default vector tables without an ADR. Prefer **custom tools** that call our clearance-aware search.

### 2.10 Model routing

Docs: [Models](https://mastra.ai/models).

- String form: `"anthropic/claude-…"`, `"openai/gpt-…"`
- Env keys auto-read (`ANTHROPIC_API_KEY`, …)
- Dynamic: `model: ({ requestContext }) => …`
- Fallbacks: array of `{ model, maxRetries, modelSettings?, providerOptions? }`
- Custom OpenAI-compatible base URLs; AI SDK provider modules accepted
- Local models via LM Studio etc.

Replaces direct `@anthropic-ai/sdk` usage for agent loops; we can keep Anthropic as the model via router.

---

## 3. Multi-agent

Docs: [Supervisor agents](https://mastra.ai/docs/agents/supervisor-agents), [multi-agent concepts](https://mastra.ai/guides/concepts/multi-agent-systems), [agents as tools](https://mastra.ai/docs/agents/using-tools#agents-as-tools).

### Patterns Mastra supports

| Pattern | Mechanism |
| --- | --- |
| **Supervisor** | Parent `Agent` with `agents: { research, writing }` — each subagent becomes `agent-<key>` tool; supervisor delegates via stream/generate |
| **Agents as tools** | Same registration; subagent needs `description` for routing |
| **Workflows as tools** | `workflows: { researchWorkflow }` → `workflow-<key>` tool |
| **Workflow orchestration** | Explicit DAG when steps are known; agents inside steps for open-ended work |
| **AgentController subagents** | Constrained child agents with `allowedControllerTools` / forked threads |
| **Network** | `routingAgent.network(…)` exists in request-context docs (routing / multi-agent network API) |

### Supervisor controls

- `delegation.onDelegationStart` — modify prompt, cap subagent steps, reject
- `delegation.onDelegationComplete` — feedback into supervisor memory, `bail()`
- `delegation.messageFilter` — strip sensitive history before subagent
- `includeSubAgentToolResultsInModelContext` — optional full nested tool payloads
- `onIterationComplete` — inject feedback / stop early
- `isTaskComplete.scorers` + rubric scorer — loop until quality bar
- Tool approval propagates from subagent tools to supervisor stream (`tool-call-approval` chunks)
- `abortSignal` cancels in-flight subagents

### Memory isolation (default)

- Subagent: new thread per delegation; resource `parent-resource-agentName`
- Full parent context **forwarded** for decision-making; only delegation prompt+response **saved** to subagent memory
- Title generation not run on ephemeral subagent threads

**script mapping idea (future):** supervisor = company-brain router; specialists = Library, Meetings, Web, Connectors — only after single-agent tool loop is on Mastra.

---

## 4. First-party tools & integrations (company-brain relevance)

Sources: monorepo layout ([GitHub tree](https://github.com/mastra-ai/mastra)), package READMEs, docs.

### 4.1 Web search

| Option | Package / API | Notes |
| --- | --- | --- |
| Provider-native | `webSearchTool` from `@mastra/core/tools` | OpenAI / Anthropic / Gemini / xAI native search |
| Tavily | `@mastra/tavily` | `createTavilySearchTool`, extract/crawl/map — **closest to our `web-search.ts` (Tavily)** |
| Exa | guide pattern with `createTool` + `exa-js` | [Web search guide](https://mastra.ai/guides/guide/web-search) |
| Bright Data / Perplexity / Firecrawl | `@mastra/…` tool packages / guides | Optional |

**Recommendation:** reimplement `web_search` as `createTool` wrapping existing Tavily logic **or** adopt `@mastra/tavily` and drop custom HTTP. Keep `TAVILY_API_KEY` in `ENV.md`.

### 4.2 RAG / vector / pgvector

| Piece | Package |
| --- | --- |
| Document chunking | `@mastra/rag` (`MDocument`) |
| PG storage + `PgVector` | `@mastra/pg` (`PostgresStore`, `PgVector`, domain partials e.g. `WorkflowsPG`) |
| Other vectors | `stores/chroma`, `pinecone`, `qdrant`, `mongodb`, … |
| Voyage embedder | `@mastra/voyageai` (default model **voyage-3.5**, dims 256/512/1024/2048 — matches ADR 0002) |
| Rerank | Voyage rerankers in `@mastra/voyageai` |
| Query tool | `createVectorQueryTool` from `@mastra/rag` |

**script:** keep Prisma `MemoryChunk` + `vector.ts` as source of truth. Optionally use `@mastra/voyageai` to replace our Voyage client for embeddings (ingestion + query) for one less hand-rolled client — **only if** dims/model stay voyage-3.5 @ 1024 and clearance filters remain on our queries.

### 4.3 MCP

`@mastra/mcp` — client + server. Useful later for external work systems without custom connectors; also for exposing script tools to IDEs.

### 4.4 Slack channel package

Two related surfaces:

1. **`@mastra/slack`** (`channels/slack`) — `SlackProvider` with app factory, OAuth, slash commands; registered on `Mastra` as `channels: { slack }`. README: [channels/slack/README.md](https://github.com/mastra-ai/mastra/blob/main/channels/slack/README.md).
2. **Channels framework** ([Channels overview](https://mastra.ai/docs/capabilities/channels/overview)) — agent-level adapters via Chat SDK (`@chat-adapter/slack` `createSlackAdapter()`), webhook path:

   ```
   /api/agents/<AGENT_ID>/channels/slack/webhook
   ```

   Thread context fetch, multi-user prefixes, tool approval cards, Redis Streams pubsub for multi-instance.

**script:** ADR 0009 Slack-first + ADR 0016 channel binding + `agent-entry.ts` (T0.5). Mastra channels could replace our Slack bot path **or** remain parallel until event-transport seam (ADR 0009 constraint) is designed. Do not wire production Slack on Mastra without mapping clearance + workspace binding.

### 4.5 GitHub signals

Package **`@mastra/github-signals`** (`signals/github`) — production signal provider for PR comments, reviews, CI, merges ([signal providers docs](https://mastra.ai/docs/long-running-agents/signal-providers)).

```ts
import { GithubSignals } from '@mastra/github-signals';

new Agent({
  /* … */
  signals: [new GithubSignals()],
});
```

**script:** ADR 0015 connector framework / GitHub — signals are **event ingress for long-running agents**, not a full work-context RAG connector. Complementary, not a replacement for “search our repos” tools.

### 4.6 Voyage embeddings package

**`@mastra/voyageai`** — Apache-2.0, depends on official `voyageai` SDK. Text / multimodal / contextualized chunk embeddings; preconfigured `voyage.v35` = voyage-3.5; memory + RAG integration examples. Aligns with ADR 0002.

### 4.7 Browser tools

Under `browser/` monorepo root:

- `agent-browser`
- `browser-viewer`
- `firecrawl`
- `stagehand`

Core also exports `@mastra/core/browser`. Templates include browsing agents. **Low priority** for company brain; optional research agent later.

### 4.8 Voice

`voice/*` packages: OpenAI, Deepgram, ElevenLabs, Azure, Google, Gemini Live, xAI realtime, AWS Nova Sonic, etc. Agent docs link [Voice guides](https://mastra.ai/guides/voice/overview). **Out of scope** for current product path unless product asks.

### 4.9 Storage adapters

Domains: memory, workflows, observability, scores, datasets, experiments, backgroundTasks, schedules, threadState ([Storage overview](https://mastra.ai/docs/storage/overview)).

Relevant providers for us:

| Package | Use |
| --- | --- |
| `@mastra/pg` | Production memory/workflow snapshots on Postgres (can share Neon with **separate schema/tables** — not Prisma models) |
| `@mastra/libsql` | Local/dev Studio |
| `@mastra/redis` / Upstash | Cache / some domains |
| Composite store | Route observability to DuckDB/ClickHouse |

**Critical:** Mastra storage is **Mastra’s runtime state**, not a substitute for Prisma tenant data (Workspace, Document, Conversation, credits). Plan either:

- **A.** Mastra PG tables in same DB, different schema (`mastra_*`), Prisma owns product tables; or  
- **B.** Keep Conversation/Message in Prisma; disable Mastra Memory / pass history as `context` messages only.

### 4.10 Fastify / server adapters

Official adapters under `server-adapters/`: **express, fastify, hono, koa, nestjs, next, tanstack-start**.

**`@mastra/fastify`** ([reference](https://mastra.ai/reference/server/fastify-adapter)):

```ts
import Fastify from 'fastify';
import { MastraServer } from '@mastra/fastify';
import { mastra } from './mastra';

const app = Fastify({ logger: true });
const server = new MastraServer({ app, mastra });
await server.init(); // or manual: registerContextMiddleware → registerAuthMiddleware → registerRoutes
```

- Peer: `fastify ^5`, `@mastra/core >=1.50`
- Engine: **`node >= 22.13.0`**
- Options: `prefix`, `openapiPath`, `streamOptions.redact`, `customRouteAuthConfig`, `mcpOptions.serverless`
- Stream redaction at HTTP boundary (system prompts, tool defs, API keys)
- MCP HTTP/SSE routes registered if MCP servers configured

**script already uses Fastify 5** — adapter is the intended embed path.

---

## 5. Embedding Mastra into existing Fastify + Prisma + pnpm monorepo

**Do not** replace the app with `npm create mastra` as the product root. Treat Mastra as a **library** inside `server/`.

### 5.1 Packages to install (server workspace)

Minimum for chat agent migration:

```bash
pnpm --filter @script/server add @mastra/core @mastra/memory @mastra/pg
# optional but high value:
pnpm --filter @script/server add @mastra/fastify @mastra/observability @mastra/mcp
# if replacing Voyage client:
pnpm --filter @script/server add @mastra/voyageai
# if replacing Tavily client:
pnpm --filter @script/server add @mastra/tavily
```

Dev/Studio (optional, separate process):

```bash
pnpm --filter @script/server add -D mastra
```

### 5.2 Compatibility gates (must resolve before install)

| Gate | Mastra | script today | Action |
| --- | --- | --- | --- |
| Node | `>=22.13.0` on Mastra packages | engines `>=20`; local often Node 24 | Bump root `engines.node` to `>=22.13.0`; enforce in CI/Docker |
| Module system | ESM (`"type": "module"`) | server is **CommonJS** (`"type": "commonjs"`, SWC → CJS) | Need interop plan: migrate server to ESM **or** dynamic `import()` seams + careful dual packaging |
| Zod | Catalog often Zod 4 | server/shared on **Zod 3** | Test Standard Schema interop; may need dual Zod or upgrade monorepo carefully |
| AI SDK | V2/V5+ model stack | Direct Anthropic SDK | Accept AI SDK as transitive; remove direct Anthropic tool loop later |
| Auth | Mastra server auth optional | JWT cookies + workspace | Keep **script auth** on product routes; only use Mastra auth if mounting Mastra routes publicly |

### 5.3 Suggested folder layout

```text
server/src/
  mastra/                      # Mastra composition root (new)
    index.ts                   # export const mastra = new Mastra({…})
    agents/
      company-brain-agent.ts
    tools/
      list-library-documents.ts
      search-library.ts
      get-document-summary.ts
      web-search.ts
    memory.ts                  # optional Memory config
    storage.ts                 # PostgresStore or “none” decision
  modules/chat/
    chat-service.ts            # still owns Conversation, credits, SSE contract
    agent/                     # shrink → thin adapter over Mastra agent
      mastra-runner.ts         # AgentRunner impl that calls mastra agent.stream
      …                        # retire hand loop when parity proven
  app.ts                       # optionally MastraServer.init with prefix /_mastra
```

### 5.4 Runtime composition (recommended)

1. **Product HTTP remains ours** — `/chat/*` routes, cookies, credits, clearance, SSE event shapes.
2. **Call Mastra as a library** from `chat-service` / `agent-entry`:

   ```ts
   const agent = mastra.getAgentById('company-brain');
   const requestContext = new RequestContext();
   requestContext.set('workspaceId', workspaceId);
   requestContext.set('maxClearanceLevel', clearance);
   requestContext.set('userId', userId);

   const stream = await agent.stream(messages, {
     requestContext,
     memory: { resource: userId, thread: conversationId }, // if using Mastra memory
   });
   // map stream chunks → AgentStreamEvent → existing SSE
   ```

3. **`RequestContext`** ([docs](https://mastra.ai/docs/server/request-context)) is the tenancy/clearance bus: tools read `context.requestContext.get('workspaceId')` etc. Reserved keys `MASTRA_RESOURCE_ID_KEY` / `MASTRA_THREAD_ID_KEY` for user isolation if Mastra HTTP is exposed.

4. **Optional:** mount `MastraServer` with `prefix: '/internal/mastra'` **behind** our auth, for Studio/debug only — not the customer chat API.

### 5.5 Streaming to clients

Mastra stream events ([streaming guide](https://mastra.ai/guides/concepts/streaming)):

- `text-delta`, `tool-call`, `tool-result`, `start`, `step-start`, `step-finish`, `finish`
- `stream.textStream` for token UI
- AI SDK bridge: `toAISdkV5Stream` from `@mastra/ai-sdk`

**script client contract today** (`AgentStreamEvent`):

- `tool_call` { name, input, statusLabel }
- `tool_result` { name, ok }
- `delta` { text }
- `citations` { citations: MessageCitation[] }

**Adapter required:** map Mastra chunks → our SSE schema in `chat-service` (do **not** force client rewrite in phase 1). Citations are **product-specific** — Mastra has no DocumentVersion citation type; tools must continue emitting `MessageCitation[]` (via custom stream events or tool result side channel).

### 5.6 Storage with Prisma/Neon

- Prefer `@mastra/pg` `PostgresStore` with **schema prefix / separate tables**, connection from `DATABASE_URL` (pooled) for app; migrations for Mastra tables are Mastra-managed on first use.
- **Do not** put embeddings in Mastra `PgVector` for Library without dual-write design — we already have HNSW indexes and clearance filters in `vector.ts`.
- For phase 1, **skip Mastra Memory** and keep Prisma Conversation/Message to avoid dual history.

---

## 6. Migration mapping (hand-rolled → Mastra)

Current stack (authoritative product docs: [`docs/agent-tools.md`](../agent-tools.md), ADR 0011):

```text
chat-service.ts
  └── getAgentRunner()  → agent-runtime.ts
        ├── hard inventory routes (library / meetings)
        └── runAgentWithTools()  Anthropic tool loop, max 6 rounds
              └── registry.executeTool()
                    ├── library-tools.ts (clearance-aware)
                    └── web-search.ts (Tavily)
```

| Our component | Path | Mastra counterpart | Migration notes |
| --- | --- | --- | --- |
| Tool registry | `agent/registry.ts` | `createTool` + `Agent.tools` | Register tools on agent; keep audit via `hooks.afterToolCall` → `AgentToolCall` table |
| Tool definitions | Anthropic `Tool` JSON | Zod `inputSchema` on `createTool` | Single source; drop hand JSON schemas |
| Builtin tools bootstrap | `register-builtin-tools.ts` | `server/src/mastra/tools/*` imported into agent | Same tools: list / summary / search / web |
| Library tools + clearance | `library-tools.ts` | `createTool` execute + `RequestContext` | **Keep** `filterAccessibleResourceIds` / `clearanceLevel lte` inside execute — never in model args |
| Web search | `web-search.ts` | `@mastra/tavily` or `createTool` wrapper | Preserve citations shape for web hits |
| Agent loop | `agent-runtime.ts` `runAgentWithTools` | `Agent.stream` / `generate` | Mastra owns maxSteps, tool loop, retries |
| Anthropic SDK completion | `defaultAnthropicCreate` | Model router `model: 'anthropic/<id>'` | Drop direct `messages.create` for agent path |
| System prompt | `AGENT_SYSTEM_PROMPT` | `Agent.instructions` (string or async fn) | Can still inject workspace-specific instructions via `RequestContext` |
| Hard inventory routes | `inventory-intent` / forced tools | Keep as **pre-agent** branch in chat-service **or** input processor | Deterministic catalog answers remain product rule (AGENTS.md §2.5) — do not rely only on model tool choice |
| SSE streaming | chat-service yields events | Map Mastra stream → `AgentStreamEvent` | Keep client `chat-api.ts` stable in phase 1 |
| Tool status labels | `statusLabel` on registry | Map `tool-call` → label table or tool metadata | Client UX dependency |
| Tool audit | `recordToolCallAudit` | `hooks.afterToolCall` + existing Prisma | Don’t rely on Mastra observability alone for compliance rows |
| Credits billing | `assertHasCredits` / `decrementCredits` in chat-service | **Stay outside Mastra** | Bill per turn before/after agent call using usage tokens from stream |
| Agent entry (Slack/webhooks) | `agent-entry.ts` | Same entry → Mastra agent | Clearance/workspace still from our binding layer |
| Conversations | Prisma Conversation/Message | Optional Mastra Memory threads | Phase 1: Prisma only |
| RAG retrieval | `search_library` + `vector.ts` | Custom tool only | Do not switch to generic `createVectorQueryTool` without clearance |

---

## 7. What we should NOT reinvent if Mastra provides it

| Capability | Use Mastra | Keep ours |
| --- | --- | --- |
| Tool-use agent loop / max steps / multi-step tool chaining | ✅ | — |
| Model routing, fallbacks, provider options | ✅ | — |
| Streaming event model (internally) | ✅ | SSE façade mapping |
| Workflow DAG + suspend/resume | ✅ (when product workflows land) | Markdown workflow product design still ours |
| Multi-agent supervisor / delegation | ✅ | — |
| MCP client/server plumbing | ✅ | — |
| Observability traces for LLM/tool spans | ✅ (optional, add exporters) | Pino request logs stay |
| Evals / rubric scorers for agent quality | ✅ | — |
| Conversation memory layers (if we adopt) | ✅ | Product Conversation UI/API |
| Slack channel adapter boilerplate | ✅ evaluate | Workspace binding, clearance, credits |
| Voyage client for embeddings | ✅ evaluate `@mastra/voyageai` | Ingest pipeline, chunk storage schema |
| Tavily tool schema/boilerplate | ✅ evaluate `@mastra/tavily` | SSRF policy, rate limits, citation DTO |

**Still reinvent / must remain product-owned:**

- Workspace tenancy and JWT/cookie auth
- Clearance ACL (ADR 0014) at every retrieval/list boundary
- Credits ledger (ADR 0006) and plan gates
- DocumentVersion / MemoryChunk / citation contract (`MessageCitation`)
- Precompute-at-ingest pipeline (ADR 0001) and BullMQ workers
- Prisma domain model and org license seats
- Design-system chat UX

---

## 8. Gaps & risks for script product

### 8.1 Workspace tenancy

Mastra “workspace” (filesystem/tools for coding agents) ≠ script **Workspace** (tenant). Tenancy must be enforced in:

- Our route layer (always)
- Tool `execute` via `RequestContext` (always)
- Never trust model-supplied `workspaceId`

Risk: mounting full Mastra HTTP routes without our auth → cross-tenant agent invoke. Mitigation: library-only embed; or `MastraServer` behind `createAuthMiddleware` + refuse public agent APIs.

### 8.2 Clearance ACL at retrieval

Mastra RAG/`PgVector`/`createVectorQueryTool` has **no** script clearance model. Generic vector query would **leak** restricted docs.

Mitigation: all Library tools stay custom; filters `clearanceLevel: { lte: maxClearance }` + principal checks remain in tool code (as today).

### 8.3 Citations tied to DocumentVersion / MemoryChunk

Our `MessageCitation` is product-typed and rendered in client. Mastra tool results are free-form.

Mitigation: tools return citations in structured output; runner aggregates like today; optional custom stream chunk type via `writer.custom` mapped to SSE `citations`.

### 8.4 Credits billing

Mastra tracks token `usage` on streams but has **no** workspace credit ledger.

Mitigation: keep `assertHasCredits` before run; `decrementCredits` after using Mastra `usage` and/or flat `CHAT_CREDIT_COST`.

### 8.5 Dual history / dual storage

Adopting Mastra Memory without retiring Prisma Conversation → split brain.

Mitigation: phase 1 no Mastra Memory; pass history from Prisma as messages.

### 8.6 ESM / CJS and Node engines

Package engines require Node 22.13+; ESM-first packages into CJS server is a real integration risk.

Mitigation: spike install + one `agent.generate` in test before broad rewrite; prefer migrating server to ESM if interop is painful.

### 8.7 EE license landmines

Do not import `@mastra/core/auth/ee` or other `ee/` paths in production without license. Stick to Apache-2.0 surfaces.

### 8.8 Slack dual-stack

`@mastra/slack` auto-provisions apps; script has its own connector/OAuth design (ADR 0009/0016). Parallel stacks confuse ops.

Mitigation: pick one Slack path per environment; evaluate Mastra channels only after agent runtime migration is stable.

### 8.9 Observability cost/ops

Full observability wants DuckDB/ClickHouse for metrics. Fine for Studio; production needs explicit retention and may duplicate Pino/ Neon load.

Mitigation: start with tracing exporter only or Langfuse; composite store later.

### 8.10 Hard inventory routes / “no scaffolding” rule

Mastra encourages model tool choice. Script **requires** deterministic inventory routes for catalog questions ([agent-tools.md](../agent-tools.md), AGENTS.md §2.5).

Mitigation: keep pre-agent hard routes or implement as Mastra **input processor** that forces tool execution.

---

## 9. Phased adoption checklist

### Phase 0 — Spike (1–2 days)

- [ ] Confirm Node ≥ 22.13 in Docker/CI; document in `ENV.md` / engines
- [ ] Spike ESM import of `@mastra/core` from server (CJS vs ESM decision recorded)
- [ ] `pnpm add @mastra/core` in a branch; `new Agent({ model: 'anthropic/…', instructions }).generate('ping')` in a Vitest
- [ ] Verify Anthropic key via model router (no direct SDK)
- [ ] **Exit:** spike green or blocked on module system with written options

### Phase 1 — Install & composition root

- [ ] Add `server/src/mastra/index.ts` with empty/minimal agent registered
- [ ] Wire `Mastra` singleton from app bootstrap (no public routes yet)
- [ ] Optional `@mastra/pg` storage behind feature flag (or skip storage)
- [ ] Update `ENV.md` if new vars (none required beyond existing `ANTHROPIC_API_KEY`)
- [ ] **Exit:** process boots; health unaffected

### Phase 2 — Wrap one agent (parity path)

- [ ] Define `companyBrainAgent` with same system prompt as `AGENT_SYSTEM_PROMPT`
- [ ] Implement `mastra-runner.ts` as `AgentRunner` using `agent.stream`
- [ ] Map Mastra stream → `tool_call` / `tool_result` / `delta` / `citations`
- [ ] Feature-flag: `AGENT_RUNTIME=mastra|legacy` (or env) for rollback
- [ ] Run existing `agent-runtime` / chat tests against Mastra runner
- [ ] **Exit:** one chat turn streams to UI with **no tools** or with stubs

### Phase 3 — Migrate tools

- [ ] Port `list_library_documents`, `get_document_summary`, `search_library` to `createTool`
- [ ] Inject `RequestContext` with `workspaceId`, `maxClearanceLevel`, `userId`, `elevated`
- [ ] Port `web_search` (Tavily) — keep citations
- [ ] `hooks.afterToolCall` → `recordToolCallAudit`
- [ ] Preserve hard inventory routes in chat-service
- [ ] **Exit:** Library + web parity; clearance tests green; credits still enforced

### Phase 4 — Retire hand-rolled loop

- [ ] Delete Anthropic tool loop from `agent-runtime.ts` (or reduce to test fakes only)
- [ ] Remove `@anthropic-ai/sdk` if unused elsewhere
- [ ] Registry becomes thin re-export or deleted in favor of Mastra tools list
- [ ] Update `docs/agent-tools.md` + ADR note (new ADR: “Agent runtime on Mastra”)
- [ ] **Exit:** only Mastra loop in production path

### Phase 5 — Multi-agent (optional product)

- [ ] Supervisor + specialist agents (Library, Web, Meetings) with descriptions
- [ ] Delegation hooks for clearance (reject tools that need higher clearance — defense in depth)
- [ ] Evaluate rubric scorer for “cited answer quality”
- [ ] **Exit:** measurable improvement or revert to single agent

### Phase 6 — Workflows (product roadmap)

- [ ] Map `docs/workflows.md` markdown workflows → Mastra `createWorkflow` where fit
- [ ] Suspend/resume for human approvals
- [ ] Do **not** block chat path on this
- [ ] **Exit:** one real guided workflow in production

### Phase 7 — Channels / signals (connector track)

- [ ] Compare `@mastra/slack` / Chat SDK adapters vs our Slack binding (ADR 0009/0016)
- [ ] GitHub signals only if long-running agent product needs PR push events
- [ ] PubSub (Redis Streams) if multi-instance channel workers
- [ ] **Exit:** ADR written; single Slack architecture

### Phase 8 — Observability / evals hardening

- [ ] `@mastra/observability` + exporter choice (storage / Langfuse)
- [ ] Eval suite for tool selection + clearance non-leak
- [ ] **Exit:** traces for production incidents; eval gate in CI optional

---

## 10. Package inventory (quick reference)

| npm package | Role |
| --- | --- |
| `@mastra/core` | Agent, workflows, tools, request-context, harness/controller, signals, storage interfaces |
| `@mastra/memory` | Memory layers |
| `@mastra/pg` | Postgres store + PgVector |
| `@mastra/libsql` | Local store |
| `@mastra/fastify` | Fastify `MastraServer` adapter |
| `@mastra/mcp` | MCPClient / MCPServer |
| `@mastra/observability` | Tracing/metrics exporters |
| `@mastra/evals` | Scorers / prebuilt rubrics |
| `@mastra/rag` | MDocument, vector query tools |
| `@mastra/voyageai` | Voyage embeddings + rerank |
| `@mastra/tavily` | Web search tools |
| `@mastra/slack` | SlackProvider (app factory) |
| `@mastra/github-signals` | GitHub PR signal provider |
| `@mastra/ai-sdk` | Stream/message bridges to AI SDK UI |
| `mastra` (CLI) | `mastra dev` / `build` / Studio |

Monorepo also: `browser/*`, `voice/*`, `stores/*`, `auth/*`, `deployers/*`, `client-sdks/*`, `observability/*`.

---

## 11. Decision summary (for a future ADR)

| Question | Research recommendation |
| --- | --- |
| Adopt Mastra for agent loop? | **Yes, as library** — retire hand-rolled Anthropic loop after parity |
| Replace Fastify with Mastra server? | **No** — use `@mastra/fastify` optionally; keep product routes |
| Replace Prisma RAG with Mastra RAG? | **No** — custom tools over existing pgvector + clearance |
| Use Mastra Memory for chat? | **Defer** — keep Prisma Conversation until dual-write plan |
| Use Mastra Slack immediately? | **No** — after agent migration + Slack ADR reconciliation |
| Production EE features? | **Avoid** until license decision |

---

## 12. Source index (primary)

| Topic | URL |
| --- | --- |
| Site / positioning | https://mastra.ai/ |
| Docs home | https://mastra.ai/docs |
| GitHub | https://github.com/mastra-ai/mastra |
| License | https://github.com/mastra-ai/mastra/blob/main/LICENSE.md |
| Agents | https://mastra.ai/docs/agents/overview |
| Tools | https://mastra.ai/docs/agents/using-tools |
| Supervisors | https://mastra.ai/docs/agents/supervisor-agents |
| Workflows | https://mastra.ai/docs/workflows/overview |
| Memory | https://mastra.ai/docs/memory/overview |
| AgentController | https://mastra.ai/docs/harness/agent-controller |
| MCP | https://mastra.ai/docs/mcp/overview |
| RAG | https://mastra.ai/guides/rag/overview |
| Models | https://mastra.ai/models |
| Streaming | https://mastra.ai/guides/concepts/streaming |
| Storage | https://mastra.ai/docs/storage/overview |
| Observability | https://mastra.ai/docs/observability/overview |
| Server adapters | https://mastra.ai/docs/server/server-adapters |
| Fastify adapter | https://mastra.ai/reference/server/fastify-adapter |
| Request context | https://mastra.ai/docs/server/request-context |
| Channels | https://mastra.ai/docs/capabilities/channels/overview |
| Manual install | https://mastra.ai/guides/getting-started/manual-install |
| Slack package README | https://github.com/mastra-ai/mastra/blob/main/channels/slack/README.md |
| Voyage package README | https://github.com/mastra-ai/mastra/blob/main/embedders/voyageai/README.md |
| GitHub signals docs | https://mastra.ai/docs/long-running-agents/signal-providers |

---

*End of baseline. Implementation requires a user-approved ADR and Phase 0 spike results before dependency install lands on main.*
