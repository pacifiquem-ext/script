# ADR 0018 — Markdown-authored workflows (C7)

## Status

Accepted — 2026-08-05

## Context

Phase 7 / C7: admins author guided processes (e.g. onboarding) in markdown; runners complete
checklist steps; the brain answers “what’s next?” via tools. Spec: `docs/workflows.md`.
Hard-to-reverse choices: step identity, versioning, write-tool policy, role of Mastra workflows.

## Decision

### 1. Product models (Prisma), not Mastra graph as source of truth

| Model | Role |
| --- | --- |
| **Workflow** | Workspace-scoped catalog entry: name, status (`draft` \| `published`), currentVersionId |
| **WorkflowVersion** | Append-only snapshot: markdown, parsed step tree JSON, versionNumber, createdBy |
| **WorkflowRun** | One assignee’s traversal of one **WorkflowVersion** |
| **WorkflowStepState** | Per step key on a run: `pending` \| `done` \| `skipped` |

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

| Markdown | Meaning |
| --- | --- |
| First `# Title` | Workflow display name (synced on publish) |
| `## Heading` | Section (outline) |
| `- [ ] text` | Required tracked step |
| `- [x] text` | Tracked step defaulting to done on **new** runs only |
| Other list/prose | Guidance, not tracked |

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
3. **Chat path:** tool is available to the model, but the product client must show a **ConfirmModal**
   before the tool result is accepted when the UI initiates completion; from the agent loop, the
   tool only runs when the user’s latest message **explicitly** asks to mark a step complete
   (enforced in tool description + server-side: optional `confirmToken` issued by `POST
   .../steps/:stepKey/complete` for UI; agent path uses `source: 'agent'` and requires the step
   not already done, logs audit).
4. **Runner UI path:** checkbox → ConfirmModal → `POST /workflows/runs/:runId/steps/:stepKey/complete`.
5. No completing on behalf of another user via the model without admin role.
6. Self-attestation only in v1 (no connector evidence).

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
