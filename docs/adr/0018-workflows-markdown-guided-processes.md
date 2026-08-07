# ADR 0018 — Markdown-authored workflows (C7)

## Status

Accepted — 2026-08-05

## Context

Phase 7 / C7: admins author guided processes (e.g. onboarding) in markdown; runners complete
checklist steps; the brain answers “what’s next?” via tools. Spec: `docs/workflows.md`.
Hard-to-reverse choices: step identity, versioning, write-tool policy, role of Mastra workflows.

## Decision

### 1. Product models (Prisma), not Mastra graph as source of truth

| Model                 | Role                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- |
| **Workflow**          | Workspace-scoped catalog entry: name, status (`draft` \| `published`), currentVersionId |
| **WorkflowVersion**   | Append-only snapshot: markdown, parsed step tree JSON, versionNumber, createdBy         |
| **WorkflowRun**       | One assignee’s traversal of one **WorkflowVersion**                                     |
| **WorkflowStepState** | Per step key on a run: `pending` \| `done` \| `skipped`                                 |

**Runs pin a WorkflowVersion.** Editing markdown creates a **new version** (like DocumentVersion /
ADR 0008). In-flight runs never mutate step keys mid-flight from author typos.

### 2. Step identity

At parse time, each `- [ ]` / `- [x]` checklist item gets:

```text
stepKey = sha256(normalizedLabel)[0..16]
```

where `normalizedLabel` is the checkbox text trimmed, lowercased, whitespace-collapsed.

- **No explicit ids in markdown** for v1 (avoids leaking machinery into the authoring surface).
- Collision within a version: append `#2`, `#3` suffixes for duplicate labels.
- Changing step text on a **new version** yields a new key; old runs keep old keys.

Sections (`##`) group steps for UI outline only; they are not tracked units.

### 3. Markdown grammar (v1)

| Markdown         | Meaning                                              |
| ---------------- | ---------------------------------------------------- |
| First `# Title`  | Workflow display name (synced on publish)            |
| `## Heading`     | Section (outline)                                    |
| `- [ ] text`     | Required tracked step                                |
| `- [x] text`     | Tracked step defaulting to done on **new** runs only |
| Other list/prose | Guidance, not tracked                                |

No YAML attributes / owner / due offsets in v1.

### 4. Mastra’s role (Phase M.6)

- **Agent tools** use Mastra `createTool` (list/get/progress/complete) on the company-brain agent.
- **Product run state** is Prisma-owned. We do **not** compile each markdown checklist into a
  Mastra `createWorkflow` graph for v1 — that graph model is for multi-step **AI orchestration**,
  not human checklist progress.
- Future connector-verified completion (P5.7) may use Mastra `createWorkflow` for evidence steps;
  that does not replace Prisma run rows.

### 5. Write tool policy (`complete_workflow_step`)

First agent **write** tool:

1. Only the **run assignee** (or workspace owner/admin) may complete a step.
2. Completing requires a **runId + stepKey** that exist on that run’s pinned version.
3. **Primary path (agent browser):** `POST /workflows/runs/:runId/execute` streams SSE while the
   **workflow-executor** Mastra agent uses Playwright tools (`browser_navigate`, `browser_click`,
   `browser_type`, `browser_snapshot`, …) to perform plain-English steps, then calls
   `complete_workflow_step` with **evidence** (`method: agent_browser`, summary, finalUrl, actions).
   Simple navigate-style labels (e.g. “Go to Github.com”) are completed deterministically without
   an LLM when possible.
4. **Agent completion without evidence is rejected.** Sources `agent` / `agent_browser` require
   `evidence.summary`. Step rows store `evidenceJson`.
5. **Manual fallback (not self-attest-as-product):** runner UI “I did this myself” for offline steps
   the browser cannot do; stores `method: manual`. No longer the primary “Run” UX.
6. **Chat path:** `complete_workflow_step` still requires evidence; do not invent completion.
7. No completing on behalf of another user via the model without admin role.
8. **Connector-verified** evidence remains Phase 8 / P5.7 (PR exists, channel joined, etc.).

### 5b. v1 self-attestation assumptions (superseded for browser-capable steps)

The original v1 design assumed:

| Assumption                                                          | Status                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Completing a step = human/agent asserts done with no external proof | Superseded for web steps: evidence required                     |
| Runner Complete button → ConfirmModal self-attest copy              | Replaced by **Run with agent** + manual fallback                |
| Checklist labels are not executable                                 | Superseded: labels are instructions for browser/agent tools     |
| No Playwright / browser tool surface                                | Added server Playwright tools + workflow-executor agent         |
| `complete_workflow_step` only needs explicit user “mark done”       | Agent may complete after performing work with evidence          |
| No `evidence` on `WorkflowStepState`                                | `evidenceJson` added                                            |
| Mastra product runs ≠ AI execution                                  | Product state stays Prisma; execution agent is separate         |
| P5.7 connector verify only future path for “real” done              | Still true for source-system proof; browser evidence is interim |

### 6. Memory

On publish (and on new version of a published workflow), upsert a **MemorySource** of type
`document`-like or a dedicated approach: embed workflow markdown into MemoryChunk as
`sourceType` — check if enum allows. If only document|meeting|channel|work_item, use
**MemorySourceType** extension `workflow` **or** dual-write as document under Library is wrong.

Prefer adding `workflow` to `MemorySourceType` if present, else store embedding via existing
document-shaped path without Library Document row: extend enum.

### 7. AuthZ

- List/read published workflows: any workspace member.
- Create/update/publish: owner/admin.
- Start run: any member (self as assignee).
- Complete step: assignee or owner/admin.

### 8. Editor dependency

**No new markdown editor package.** Author UI = textarea + live outline + `MarkdownContent`
preview (existing). AlignUI only.

## Consequences

- Migration adds four models (+ optional MemorySourceType.workflow).
- Chat tools grow by four Mastra tools.
- First write tool requires ConfirmModal pattern in client.
