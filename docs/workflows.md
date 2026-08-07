# Workflows — markdown-defined guided processes

**Status: implemented (agent-executable).** ADR 0018 (amended). Backend: Prisma models, markdown
parser, HTTP routes, Mastra tools (`list_workflows`, `get_workflow`, `get_my_workflow_progress`,
`complete_workflow_step` **with evidence**), Playwright browser tools, `POST .../runs/:runId/execute`
SSE (workflow-executor agent + navigate heuristics), publish-time memory embed. UI: author
(textarea + outline + preview), runner (**Run with agent**, evidence on steps, manual offline
fallback). **Residuals:** agent write HITL/confirmToken (P5.6b), connector-verified completion
(P5.7), passive RAG over workflow chunks, login/session for sites that require user credentials.

`product_path.txt` calls this **"the ultimate feature"**, so it gets a spec rather than a bullet.

---

## 1. The job to be done

> An admin writes an "Onboarding Workflow" in a markdown editor on the website. A new hire is told
> to open the onboarding workflow. The app then drives everything: if the admin wrote a checklist,
> the app **ensures all of those items are followed**.

Two roles, two experiences:

- **Author (admin)**: writes a workflow the way they'd write a wiki page — in markdown — and gets a
  live, trackable process out of it. No form builder, no node graph, no DSL to learn.
- **Runner (new hire)**: opens the workflow and is guided step by step, can ask the brain questions
  at any point ("where's the expense policy?"), and cannot quietly skip a required step.

The core bet: **markdown is the authoring surface and the source of truth.** Structure is derived
from the document, not maintained separately from it.

## 2. Markdown as the definition

The parser reads ordinary markdown and derives structure — a plain document must stay valid.

| Markdown                   | Meaning                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `# Title`                  | Workflow name                                               |
| `## Heading`               | A section / phase                                           |
| `- [ ] item`               | A **required step** the runner must complete                |
| `- [x] item`               | A step pre-completed by the author (rare; template default) |
| `- item`                   | Guidance, not tracked                                       |
| Prose, tables, code        | Instructions shown in place                                 |
| Links to Library documents | Resolved into openable, citable references                  |

Anything beyond checklists (an owner, a due offset, a verification rule, a step that must be
approved by someone else) needs syntax. Prefer a small, optional, YAML-ish attribute on the step
line or per-section frontmatter over inventing a new markup language — and **decide it in the ADR**,
because it is the one part of this feature that is hard to reverse.

Open questions to resolve before build:

- Are steps identified by content hash or by an explicit stable id? Content-hash ids break progress
  when an author fixes a typo; explicit ids leak machinery into the markdown. This choice determines
  whether editing a live workflow corrupts in-flight runs.
- Do edits apply to running instances, or does each run pin a version? (The Library already answers
  the analogous question with append-only `DocumentVersion` — reuse that thinking.)
- What does "ensures all of those are followed" mean operationally? **Agent browser execution** is
  the primary path for web-capable steps (Playwright tools + evidence on the step). Manual
  confirmation is only for offline work. Connector-verified completion (PR exists, channel joined)
  remains P5.7 / [`connectors.md`](./connectors.md).

## 3. Model sketch

- **Workflow** — workspace-scoped, name, markdown body, author, status (draft/published).
- **WorkflowVersion** — append-only snapshot of the markdown plus the parsed step tree. Runs pin a
  version. Mirrors `DocumentVersion` (ADR 0008) deliberately.
- **WorkflowRun** — one person's traversal of one workflow version: assignee, started/completed,
  current position.
- **WorkflowStepState** — per step per run: pending / done / skipped / blocked, who changed it, when,
  and (later) the evidence that satisfied it.

Notably a workflow is _also_ memory: its markdown should be embedded like a document so "what's the
onboarding process?" is answerable in chat by anyone, independent of whether they have a run.

## 4. Agent tools

Per [`agent-tools.md`](./agent-tools.md), workflows enter the brain as tools:

| Tool                       | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `list_workflows`           | What guided processes exist in this workspace            |
| `get_workflow`             | The steps and instructions of one workflow               |
| `get_my_workflow_progress` | Where the current user is, what's next, what's blocking  |
| `complete_workflow_step`   | **Write** — mark done **with evidence** after work       |
| `browser_*`                | Playwright navigate/click/type/snapshot (executor agent) |

`complete_workflow_step` is the project's first agent **write**. Evidence is required for agent
sources. Browser tools live on the workflow-executor agent (not the default chat inventory path).

## 5. UI surfaces

Three new surfaces, all bound by `understanding.md` (Align-UI, Huge Icons, `rounded-20`, `w-fit`):

1. **Workflow list** — workspace workflows, draft/published, with run counts.
2. **Markdown editor (author)** — split or toggled edit/preview, live-parsed step outline so the
   author sees exactly which lines became required steps. Reuse the existing markdown renderer used
   for chat/document previews rather than adding a second markdown stack. An editor library is a new
   dependency → **stop and ask** before adding one.
3. **Run view (runner)** — pinned guidance, progress, **Run with agent** (SSE execute), evidence
   on completed steps, manual “I did this myself” for offline steps, Chat for questions.

Assistant integration: a run in progress should be visible from chat, so "what do I do next?" is
answerable without navigating away.

## 6. Sequencing

1. ADR: step identity, versioning-vs-live-edit, write-tool policy, extra syntax (if any).
2. Parser + model + read-only tools (workflows answerable in chat, not yet runnable).
3. Author editor.
4. Runs, progress, run view.
5. `complete_workflow_step` write tool with evidence.
6. Agent browser execution (`POST .../execute` + Playwright tools) — primary “ensures followed” path.
7. Verified completion via connectors (P5.7).

Steps 1–6 are independent of connectors; only connector-verified completion is blocked.
