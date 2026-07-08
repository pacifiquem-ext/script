# Testing & coverage

## Commands

| Command              | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `pnpm test`          | All package tests (unit + server contract/integration)        |
| `pnpm test:coverage` | Unit-surface coverage with **≥90%** line/statement thresholds |

## Coverage scope (unit surface)

Full-app 90% (every page/route) is not the gate. Thresholds apply to pure / unit-testable modules:

| Package          | Included paths                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `@script/shared` | all `src/**`                                                                                              |
| `@script/server` | `src/common/**`, `src/lib/**` (except logger), `src/config/rate-limits.ts`, `src/modules/jobs/extract.ts` |
| `@script/client` | `src/lib/**`, `src/components/ui/**`, `src/hooks/**` (icons/BrandIcons excluded)                          |

Server route/service modules keep **contract tests** under `server/test/*.test.ts` (auth, library, chat, …) without counting their full graphs toward the unit gate. Expand the unit include list when more pure modules are carved out.

## Thresholds

- Lines / statements / functions: **90%**
- Branches: **80%** (branch-heavy UI conditionals)

CI runs `pnpm test:coverage` after `pnpm test`.
