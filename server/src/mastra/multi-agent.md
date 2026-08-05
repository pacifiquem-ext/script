# Multi-agent readiness (Phase M.5)

**Status:** single-agent path is the production default.

## Specialists as tools (current)

| Domain | Form | Why |
| ------ | ---- | --- |
| Library | tools on `company-brain` | Clearance-scoped retrieval; low prompt cost |
| Meetings | tools | Same |
| Work items | tools | Same |
| Web search | tool (`@mastra/tavily` client) | Generic; Mastra package |
| Channel context | tools later | Bound channels feed MemoryChunk; still tools |

## When to introduce supervisors

Add a Mastra supervisor (`agents: { specialist }`) only when:

1. Single-agent instructions + tool list exceed reliable tool selection, **or**
2. Parallel research/work streams need independent specialists with different models.

Until then: **one brain agent**, one entry (`chat-service` + `handleAgentAskWithoutConversation`).

## Slack / connectors

Slack bot surface calls the same Mastra agent entry as web chat (T0.5). Do not adopt
`@mastra/slack` until ADR reconciliation with 0009/0016.
