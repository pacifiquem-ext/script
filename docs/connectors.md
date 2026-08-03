# Connectors — extending the brain beyond files

**Status: ROADMAP. Nothing in this document is implemented.** No connector models exist in
`server/prisma/schema.prisma`; no Slack/Teams/WhatsApp/Notion/Jira/GitHub/call code exists in
`server/src`. Do not build from this file without an ADR per `AGENTS.md` §15 — it is the shared
design target, not an approved schema.

What _is_ shipped: **file** OAuth integrations (Drive, Dropbox, OneDrive, Box) that import documents
into the Library. Those are `Integration` in the domain model. Everything below is a **Connector** —
a different concept, deliberately given a different word (`CONTEXT.md`).

---

## 1. Why connectors exist

`product_path.txt` defines the company brain as knowing _everything about the company_, not just its
files. Three families of truth live outside the Library:

| Family           | Systems                                    | Questions it must answer                                  |
| ---------------- | ------------------------------------------ | --------------------------------------------------------- |
| **Conversation** | Slack, Microsoft Teams, WhatsApp           | "In last Friday's meeting, who said they'd take X?"       |
| **Work**         | Notion, Jira, GitHub                       | "Who's working on this?" · "What's project X's overview?" |
| **Calls**        | Meeting/call recording + summary providers | "What did we decide on the client call?"                  |

Each family needs the same four things, which is why they share one framework rather than three
bespoke integrations.

## 2. The four capabilities every connector needs

1. **Install & credentials** — workspace-scoped OAuth or token install, encrypted at rest with
   `TOKEN_ENCRYPTION_KEY` (the pattern `integrations-service.ts` already uses), a scopes screen, and
   a visible disconnect that revokes remotely as well as locally.
2. **Ingest (memory)** — pull or subscribe to content, normalize it, chunk + embed it into the same
   pgvector store the Library uses, so one retrieval path serves everything. Provenance must survive
   into citations: a citation to a Slack message opens that message, not a document.
3. **Tools (live query)** — read-only tools per [`agent-tools.md`](./agent-tools.md) for facts too
   fresh or too structured to index (open issues, current assignee, channel membership).
4. **Clearance** — a connector is the single biggest way the brain leaks. Private channels, private
   repos, and restricted Jira projects must not become answerable by someone who cannot see them in
   the source system. **This is a build blocker, not a follow-up.** See §6.

## 3. Family A — Messaging surfaces (Slack, Teams, WhatsApp)

This family is different from the others: script is not only _reading_ these systems, it **lives
inside them as an app**. Two halves, both required.

> **Decided (ADR 0009): v1 ships Slack only.** Teams is second, WhatsApp third. The per-platform
> table below is reference for when those land — it is not a v1 build list. The framework stays
> provider-agnostic, but only the Slack adapter exists at first.

### 3.1 The bot surface (script answers where people already talk)

Required behavior, from `product_path.txt`:

- The app is installed into a workspace/team/group and **added to channels**.
- A user tags it: `@script who said they'd own the migration on Friday?`
- The app **acknowledges immediately with a loading reaction/emoji** on the triggering message.
- It answers **in a thread** on that message — never as a new top-level post.
- The answer uses **everything knowable**: channel history, files shared in the channel, the
  Library, and other connectors — one brain, not a per-surface brain.
- The reaction is swapped/removed when the reply lands (and on failure, a distinct failure state
  with a human-readable reason — the same "no raw provider dumps" rule as ingestion errors).

Implementation notes per platform:

|         | Slack                                  | Microsoft Teams                   | WhatsApp                                         |
| ------- | -------------------------------------- | --------------------------------- | ------------------------------------------------ |
| Install | Slack app + OAuth v2, bot token        | Azure Bot / Teams app manifest    | WhatsApp Business Cloud API                      |
| Trigger | Events API `app_mention`               | Bot Framework activity `@mention` | Inbound message webhook                          |
| Ack     | `reactions.add` (e.g. hourglass)       | typing indicator / adaptive card  | typing indicator or ✅ receipt                   |
| Reply   | `chat.postMessage` with `thread_ts`    | reply to conversation activity    | reply-with-context to message id                 |
| Threads | native                                 | native                            | quoted-reply (no true threads)                   |
| History | `conversations.history` (needs scopes) | Graph channel messages            | **not retrievable** — only what the bot receives |

WhatsApp is the odd one out and must be scoped honestly: there is no channel history API, so its
"channel context" is only messages the app itself observed after being added, plus the Library and
other connectors. Do not promise retroactive WhatsApp memory.

### 3.2 Channel context (the memory half)

A bound channel becomes a memory source:

- **Binding**: an explicit record of "this connector is listening to this channel", created when the
  app is added, with who added it and when.
- **Backfill + tail**: an initial history pull (where the platform allows) and then event-driven
  ingest of new messages, threads, edits, deletions, and shared files. Deletions must propagate —
  a message removed at the source stops being answerable.
- **Normalization**: message → author identity, timestamp, thread parent, channel, permalink, plus
  resolved attachments. Shared files should flow into the Library ingest pipeline so a PDF dropped
  in `#eng` is a first-class document.
- **Consent & retention**: joining a channel is a data-collection event. It needs an in-channel
  announcement, a workspace-level retention setting, and an audit trail. Treat this as a legal
  requirement, not UX polish.

### 3.3 The "who said they'd do X" problem

Retrieval over raw messages answers this badly — the useful unit is a **commitment** (person +
obligation + time + source), not a chunk. Plan for a light extraction pass over conversation and
call transcripts that records decisions, owners, and follow-ups as structured, citable rows.
Semantic search stays the fallback, not the primary path. This is the same lesson as
`list_library_documents`: for structured questions, structure beats similarity.

## 4. Family B — Work systems (Notion, Jira, GitHub)

Target questions: _"Who's working on this?"_ and _"What's project X's overview?"_

- **Notion**: OAuth integration, page/database sync, block → text normalization. Pages are the
  closest to documents; index them.
- **Jira**: OAuth (3LO) or API token, project/issue/sprint sync, webhooks for changes. Issues are
  structured — index the text, but answer assignment/status questions with a **live tool** so the
  answer is never stale.
- **GitHub**: GitHub App install (not a PAT), repos/issues/PRs/reviews, webhooks. Code search is out
  of scope for v1; issues, PRs, and READMEs are in.

Design note: these three collapse into one internal shape — a **work item** (id, title, body, state,
assignee, project, url, updatedAt) plus a **project**. Building three independent verticals will
triple the tool surface and the prompt. Normalize once, adapt per provider.

Identity is the hard part: "who's working on this" requires mapping a Jira account, a GitHub login,
a Slack user, and a script `User` to one person. A **person identity map** is shared infrastructure
for this family and for §3/§5 — design it before the second connector, not after.

## 5. Family C — Calls & meetings

`product_path.txt` lists a **calls summaries provider** first. Two distinct sources, and they are
not interchangeable:

1. **Provider summaries** — a meeting platform (or a notetaker product) already produces a
   transcript and summary; script ingests them via API/webhook. Cheapest path to value, no media
   handling, no consent machinery of our own.
2. **In-app capture** — the `pipeline.md` P1 idea: record in the browser, transcribe, ingest. This
   is a _different_ job (ad-hoc notes) and should not block or be conflated with (1).

Either way the brain needs: transcript with speakers and timestamps, a summary, extracted decisions
and action items (see §3.3), links back to the source recording, and participant identities mapped
through the same person identity map. Citations must be able to point at a moment in a call.

Any transcription vendor is a **paid dependency → stop and ask** (`AGENTS.md` §15) before adoption.

## 6. Clearance (blocking constraint)

Today "clearance" means workspace membership: every member can retrieve every chunk in the
workspace. That is defensible for a Library everyone uploaded to. It is **not** defensible the
moment a connector ingests a private channel, a restricted Jira project, or an HR call.

Before the first connector ships, the brain needs:

- a per-source-object ACL captured at ingest (channel members, repo collaborators, page permissions),
- ACL filtering pushed **into** the retrieval query and each tool, not applied after the model reads
  the data,
- re-evaluation when source permissions change (a removed channel member loses access to history),
- the same filter on the messaging bot surface, where the asker is a platform identity, not a
  logged-in script user.

## 7. Sequencing

The dependency order matters more than the pick of first connector:

1. **Tool registry + clearance-aware tool context** ([`agent-tools.md`](./agent-tools.md) §4).
2. **Connector framework**: install/credentials/scopes/disconnect/audit, one provider-agnostic model.
3. **Non-document memory**: generalize ingest so a message or an issue can be embedded and cited the
   way a document version is today (`ADR 0001` currently assumes documents).
4. **Person identity map**.
5. **First pilot connector end to end** — ship it fully (install → ingest → tool → citation →
   clearance → UI), then repeat. One deep connector teaches more than three shallow ones.
6. **Bot surface** for **Slack** (ADR 0009), reusing the agent runtime through a webhook entry point.
   Teams and WhatsApp follow only after Slack is complete.

## 8. UI surfaces this implies

Not designed yet; `understanding.md` carries the design rules. Expect: a Connectors section in
Settings (separate from file Integrations), a per-connector scopes/consent screen, a channel/source
binding manager with retention controls, source-type-aware citation chips in chat (a message chip is
not a document chip), and honest **Coming soon** labels until each lands.

## 9. Self-hosting (open — do not design it out)

The project already self-hosts its **infrastructure**: Redis, Postgres + pgvector and Garage via
Docker Compose (`docs/local-infra.md`, `docs/storage.md`), with Neon + UploadThing as managed
defaults. What it has never had to solve is a self-hosted deployment that receives **inbound events
from a third party**. Connectors introduce that.

This is **not decided** (ADR 0009 records it as an open design space). It is here so the Slack build
doesn't foreclose it. Two constraints:

- **Inbound event transport.** Slack's Events API needs a publicly reachable HTTPS endpoint; a
  self-hosted instance behind a corporate firewall may not have one. Slack **Socket Mode** solves
  exactly this with an outbound WebSocket. Whichever ships first, keep **webhook signature
  verification, event normalization, and the agent entry point separable** so a second transport is
  an adapter, not a rewrite.
- **Per-instance app credentials.** A self-hosted operator registers their own Slack app and
  supplies their own credentials — the pattern `ENV.md` § Cloud OAuth keys already establishes for
  the file providers. A published app manifest turns that into a paste-one-file step.

Still open, each needing its own ADR if we commit: per-instance app registration UX, whether an
air-gapped deployment is ever in scope (Anthropic and Voyage are hosted, required dependencies
today), and whether self-hosted instances are single-workspace by default.

## 10. Environment variables

None of these exist in `server/src/config/env.ts` yet. `ENV.md` lists the anticipated set under
**Planned — connectors**; add them to the Zod schema only in the PR that implements the provider.
