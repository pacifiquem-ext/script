# ADR 0009: Slack is the only messaging connector in v1

## Status

Accepted — 2026-08-03

## Context

`product_path.txt` names **Teams, WhatsApp and Slack** as the messaging surfaces the company brain
should live in: the app is added to channels, tagged with a question, reacts with a loading emoji,
and replies in thread using everything it knows.

Building three platforms at once is the obvious way to get all three wrong. They differ in every
dimension that matters — install model, history access, threading, reactions, identity:

|           | Slack                   | Teams                                                 | WhatsApp                                                 |
| --------- | ----------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Install   | Slack app + OAuth v2    | Azure Bot + Teams app manifest + tenant admin consent | WhatsApp Business Cloud API + Meta business verification |
| History   | `conversations.history` | Graph channel messages                                | **None** — only what the app observes after joining      |
| Threads   | Native                  | Native                                                | Quoted replies only                                      |
| Reactions | `reactions.add`         | No true message reaction for bots                     | Limited                                                  |
| Identity  | Workspace user ids      | Entra ID tenant identities                            | Phone numbers                                            |

Slack is the only one where the behavior the product path specifies — ack with a reaction, reply in
thread, read channel history — maps cleanly onto the platform's own primitives. Teams needs a
different ack affordance and tenant admin consent. WhatsApp cannot do retroactive channel memory at
all and would ship the weakest version of the feature first.

Separately: the project already self-hosts its **infrastructure** (Redis, Postgres + pgvector,
Garage — `docs/local-infra.md`). It does not yet have a self-hosting story for a product that
receives **inbound webhooks from third parties**, and that gap constrains connector design.

## Decision

**Ship the whole product with Slack as the only connector app.** Teams follows, WhatsApp after that.

- v1 of the company brain is: document Library + calls + work systems + workflows + **Slack**.
- Teams is the second messaging platform. WhatsApp is third, and ships with an explicit, honest
  statement of its history limitation rather than a pretense of parity.
- The connector framework stays provider-agnostic (`docs/connectors.md` §2) even though only one
  provider exists at first. One provider is the proof the abstraction works; it is not permission
  to hard-code Slack into the agent runtime, the memory model, or the UI.
- Platform-specific behavior lives behind the provider adapter. If a change to support Slack has to
  reach into shared retrieval, clearance, or tool code, that is a signal the abstraction is wrong.

**Self-hosting of connectors is deliberately left open**, and this ADR does not decide it. It is
recorded here because two known constraints must not be designed out prematurely:

1. **Inbound events.** Slack's Events API requires a publicly reachable HTTPS endpoint, which a
   self-hosted instance behind a corporate firewall may not have. Slack **Socket Mode** (outbound
   WebSocket, no public ingress) exists precisely for this. Whichever we build first, the event
   handling path should treat "how the event arrived" as a transport detail, not a fact baked
   through the connector.
2. **Per-instance app credentials.** A self-hosted operator cannot use our Slack app. They register
   their own and supply their own credentials — the same pattern `ENV.md` § Cloud OAuth keys already
   establishes for Drive/Dropbox/OneDrive/Box. A Slack app manifest makes that a paste-one-file
   step rather than a twenty-field form.

## Consequences

- `TODO.md` Phase 6 builds Slack only. Teams and WhatsApp sit in Phase 8 (breadth), in that order.
- Marketing may name Teams and WhatsApp as roadmap, never as live (`projectdef.md` §10.2).
- The transport seam above is a **v1 design constraint**, not a v2 refactor: keep webhook
  verification, event normalization, and the agent entry point (`TODO.md` T0.5) separable so a
  Socket Mode transport can be added without rewriting mention handling.
- Full self-hosting of the company brain remains an open design space. Known unresolved pieces, to
  be decided in their own ADRs when we commit: inbound event transport, per-instance app
  registration UX, and whether an air-gapped deployment (no hosted Anthropic/Voyage) is ever in
  scope — today both are required, hosted dependencies.
- Reversal cost is low for ordering (Teams could be pulled forward) and high for abstraction damage
  (Slack-specific assumptions leaking into shared code). Guard the second, stay flexible on the first.
