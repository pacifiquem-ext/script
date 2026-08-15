# Pitch-ready checklist

Use this when preparing to pitch **script** as an
organization-ready product. These items are **not** the org MVP build order (P7 → P6 → P9a …);
they are the extras buyers and IT often ask for before saying yes.

**When to open this file**  
Before sales decks, security questionnaires, POCs, or “are we ready to pitch?” reviews.

**Suggested early pitch set** (after org MVP P7→P9a): **G1, G3, G6, G14** (story) + **G2, G7**
(IT). Add **SSO (pipeline P9b)** before regulated logos; **G5 + G11** before board-level demos.

Status on each item: track in issues when you commit to build — this file is the
glossary and rationale.

---

## G1 — Packaging & price card

**What**  
A clear offer: e.g. Starter / Team / Enterprise at $X per seat / month, what’s included (seats,
shared credits, support level), what’s not.

**Why**  
Without a number and boundaries, the pitch is “cool demo — how much?”

---

## G2 — Install story

**What**  
One blessed path to production: hardened Compose or Helm, required env vars, “IT can stand this
up in a day.”

**Why**  
A laptop demo is not the same as a deployable product. IT needs a single supported recipe.

---

## G3 — First-run admin wizard

**What**  
Guided first hour: paste activation key → create org admin → invite a few people → upload a doc →
ask a question and see a citation.

**Why**  
Time-to-value in the room. Makes the product feel finished, not like a repo checkout.

---

## G4 — Org entity above workspace

**What**  
Optional model: one **customer/org** owns several **workspaces**, under one license.

**Why**  
Companies often buy once and run multiple teams. Today the product is mostly workspace-centric.

---

## G5 — Admin usage dashboard

**What**  
Numbers for champions: seats used, credit burn, license expiry, failed ingests, maybe questions
asked this week.

**Why**  
Buyers renew what they can prove is used.

---

## G6 — Security pack

**What**  
Documents security will request: DPA template, subprocessors (e.g. Anthropic, Voyage, Resend),
data-flow diagram, honest SOC2 _roadmap_ (not a fake certificate).

**Why**  
Security review is a hard gate for many orgs.

---

## G7 — Backup / restore drill

**What**  
Documented RPO/RTO and a **tested** restore of Postgres + object storage — not only “we have
volumes.”

**Why**  
Ops due diligence. “Can we get our Library back?” must have a yes with evidence.

---

## G8 — HA / scale notes

**What**  
Written guidance: sizing for ~20 seats vs ~200; when to add API/worker replicas; GPU notes if
self-hosting models (pipeline P8).

**Why**  
Stops the “does it fall over?” objection in procurement.

---

## G9 — SCIM / directory sync

**What**  
After SSO: when HR adds/removes someone in Okta/Azure AD, they appear/disappear in script
automatically.

**Why**  
Manual email invites don’t scale past a small team.

---

## G10 — Support / break-glass

**What**  
Support tiers, response expectations, status channel; optional audited admin impersonation to fix
customer issues.

**Why**  
Post-sale trust. Orgs need to know who to call when it’s down.

---

## G11 — Answer-quality harness

**What**  
Fixed sample corpus + golden questions run before demos (“What’s our parental leave policy?” →
must cite doc X).

**Why**  
Avoid live-demo embarrassment when the model goes sideways.

---

## G12 — Prompt-injection / data-exfil hardening

**What**  
Treat uploaded documents as **untrusted** input. Keep answers grounded in citations; don’t let
tool-use do dangerous things because a PDF said “ignore previous instructions.”

**Why**  
Security and brand risk once the Library holds real company truth.

---

## G13 — White-label / custom domain

**What**  
Customer logo and domain instead of default “script” branding.

**Why**  
Some buyers require it; many don’t for v1. Later-tier item.

---

## G14 — Pilot kit

**What**  
30-day POC package: sample Library, demo script, success criteria (e.g. “80% of exec questions
answered with citations”).

**Why**  
Makes “let’s try” easier to approve than an open-ended experiment.

---

## G15 — Version upgrade path

**What**  
How a self-host customer upgrades to the next script release without losing Library data
(migrations, rollback notes).

**Why**  
Multi-year contracts fear lock-in to an un-upgradable install.

---

## G16 — Legal

**What**  
MSA, license terms of service, acceptable use policy, export-control notes if any.

**Why**  
Lawyers need a signature stack before ink.

---

## Related

- Product vision: [`projectdef.md`](../projectdef.md)
