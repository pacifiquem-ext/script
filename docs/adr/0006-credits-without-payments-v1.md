---
status: accepted
---

# v1 tracks plans and credits in-database with no payment processor

Workspaces carry a `plan` (`free` | `pro` | `team`), a `CreditBalance`, and append-only
`CreditLedgerEntry` rows. AI usage decrements credits atomically. "Purchase credits" in the UI is
honestly unavailable or admin-grant-only until a processor is chosen. Stripe (or similar) is
explicitly out of v1 scope.
