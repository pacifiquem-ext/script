---
name: alignui-ui
description: Strict AlignUI v1.2 UI implementation rules for script client work. Use whenever editing React UI, feedback states, forms, modals, toasts, empty/loading/error views, or any client/src component.
---

# AlignUI UI — mandatory practice for `client/`

Canonical external reference: [AlignUI v1.2 docs](https://www.alignui.com/docs/v1.2/introduction)
(copy/paste, Radix behaviors, Tailwind styling, TypeScript, accessibility built in).

Repo references that still apply: existing
primitives in `client/src/components/ui/`.

If this skill does not answer a UI question, run the `find-skills` skill (`npx skills find …`)
for domain help (design-system, toast, feedback, a11y) **before** inventing a one-off pattern.

## 0. Non‑negotiables (fail the PR if violated)

1. **Never use browser chrome for product UX**
   - Forbidden: `window.alert`, `window.confirm`, `window.prompt`, `alert()`, native
     `<dialog showModal()>` without AlignUI styling, unstyled `confirm()` delete flows.
   - Required replacements:
     - Ephemeral success/info/error after an action → **Toast** (`/docs/v1.2/ui/toast`, Sonner +
       Alert toast wrapper) or **Notification** (`/docs/v1.2/ui/notification`, Radix Toast).
     - Destructive or irreversible confirmations → **Modal** (`/docs/v1.2/ui/modal`, Radix Dialog)
       with title, description, cancel + destructive `Button` (`variant="error"`).
     - Rename / single-field collect → **Modal** with `Input` + primary/cancel actions (not `prompt`).
2. **Never dump raw errors as naked red text as the only pattern**
   - Forbidden as the sole feedback: `<p className="text-error-base">{error}</p>` scattered ad hoc,
     `setError` rendered only as an unstyled inline string with no role/icon/dismiss.
   - Required: shared feedback primitives (below) with `role="alert"` / `aria-live`, status icon,
     token colors (`error-base`, `error-lighter`, `success-*`, `warning-*`), optional dismiss/retry.
3. **Maximize AlignUI / shared `components/ui` reuse**
   - Prefer porting the AlignUI source block into `client/src/components/ui/` over bespoke markup.
   - Reuse `Button`, `Input`, `Badge`, `EmptyState`, `ErrorState`, `LoadingState` before adding files.
   - New primitives must follow AlignUI compound patterns (`Root` / `Content` / slots) and tokens.
4. **Icons are Huge Icons only** (`@hugeicons/react`) — map AlignUI Remix examples to Huge Icons
   equivalents; do not add `@remixicon/react` or `lucide-react`.
5. **Buttons are `w-fit` by default**; modals use **`rounded-20`** (AlignUI Modal content uses
   `rounded-20` — keep that contract).
6. **Real data, real states, premium presentation** — loading/empty/error/success must be designed,
   not browser defaults.

## 1. AlignUI catalog map (v1.2) → when to use what

Source nav from docs “All Components”. Port on demand; do not re-implement from scratch.

### Actions
| AlignUI | Use for |
| --- | --- |
| Button / Compact Button / Link Button | Primary actions, icon-only chrome, text links styled as buttons |
| Fancy Button | Marketing/landing CTAs only |

### Feedback (mandatory for status communication)
| AlignUI | Use for |
| --- | --- |
| **Alert** | Inline status blocks (form top, panel inline). Statuses: `error`, `warning`, `success`, `information`, `feature`. Variants: `filled`, `light`, `lighter`, `stroke`. Compose title + description + optional action. |
| **Toast** (+ Alert toast) | Brief global feedback after mutations (saved, deleted, copied, failed). Stacking, `bottom-center` default per AlignUI. Built on **sonner**; render content with Alert. |
| **Notification** | Richer corner notifications with title/description/action (Radix Toast). Prefer Toast+Alert for simple strings; Notification when action buttons persist briefly. |
| **Banner** | Full-width critical/system messages at top of app shell (maintenance, billing lock, verify email). |

### Overlays
| AlignUI | Use for |
| --- | --- |
| **Modal** | Confirm delete, rename, multi-step lightweight forms, privacy destructive flows. Focus trap + overlay blur per Radix Dialog. |
| Drawer / Popover / Dropdown (as documented) | Side panels, menus, anchored content — never native `prompt`. |

### Form
| AlignUI | Use for |
| --- | --- |
| Input, Textarea, Select, Checkbox, Radio, Switch, Hint, Label, Form message patterns | All forms. Field errors use **Hint/Form message** under the control in `text-error-base` / error styles from AlignUI Input “With Label and Hint”, plus optional inline Alert for form-level errors. |

### Displaying data
Badge, Status Badge, Tag, Avatar(s), Divider, Progress Bar/Circle, Data Table, Kbd — use for
metadata chips, processing phases, membership roles, upload progress (real values only).

### Navigation / Utils
Use documented nav primitives inside app chrome; `cn` / `tv` utilities when porting AlignUI source.

## 2. Feedback decision tree (memorize)

```
User did something asynchronous?
  ├─ Success, no navigation change → toast.success / AlertToast status="success"
  ├─ Failure not tied to one field → toast custom Alert status="error" OR inline Alert in context panel
  └─ Failure on one field → Hint under Input + aria-invalid; do not toast alone

Need a decision before mutating?
  └─ Modal confirm (cancel + destructive/primary). Never window.confirm.

Need text input for a name/title?
  └─ Modal with Input, validation, Save/Cancel. Never window.prompt.

Page/section failed to load?
  └─ ErrorState (full section) with retry Button.

No data yet?
  └─ EmptyState with optional action Button.

Long-running system message?
  └─ Banner in AppLayout.
```

## 3. Required shared primitives to introduce during UI cleanup (§ critical TODO)

Until these exist in `client/src/components/ui/`, new UI work that needs them **must add the
AlignUI port first**, then use it (do not bypass with `window.*` or naked red text):

| Primitive | Path (target) | AlignUI source |
| --- | --- | --- |
| `Alert` | `components/ui/Alert.tsx` | `/docs/v1.2/ui/alert` |
| `Toast` + `Toaster` + `AlertToast` | `components/ui/toast.tsx`, `toast-alert.tsx` | `/docs/v1.2/ui/toast` |
| `Notification` (if needed) | `components/ui/notification.tsx` | `/docs/v1.2/ui/notification` |
| `Banner` | `components/ui/Banner.tsx` | `/docs/v1.2/ui/banner` |
| `Modal` compound | `components/ui/Modal.tsx` | `/docs/v1.2/ui/modal` |
| `ConfirmModal` | thin wrapper over Modal + Button | destructive flows |
| `PromptModal` / `FormModal` | thin wrapper over Modal + Input | rename/create name |
| `InlineAlert` or reuse `Alert` | form/panel inline errors | replace ad hoc `text-error-base` paragraphs |
| `FieldHint` | under inputs | AlignUI Hint pattern |

Mount `<Toaster />` once in root layout (`AppLayout` / router root).

Adapt AlignUI snippets to this repo: Huge Icons, existing tokens in `tailwind.config.js` /
`index.css` (`primary-base`, `error-base`, `neutral-*`, `rounded-20`, typography `.text-para-sm`).

## 4. Known violations to eradicate (inventory for critical cleanup)

Grep regularly: `window\.alert|window\.confirm|window\.prompt|\balert\(|\bconfirm\(|\bprompt\(`.

Current hotspots (non-exhaustive):

- `client/src/components/layout/AppLayout.tsx` — chat rename/delete + workspace create via
  `prompt`/`confirm`/`alert`; plain error paragraph for chat list failures.
- `client/src/pages/app/LibraryPage.tsx` — folder create via `window.prompt`.
- `client/src/pages/app/SettingsModal.tsx` — credit share via `window.prompt`; assorted raw
  `text-error-base` lines for invite/password/privacy errors.
- Auth pages + `ChatPage` — form/chat errors as lone `<p className="text-error-base">` / span
  without Alert primitive (acceptable interim only until `Alert` lands; cleanup must upgrade).

Also replace hover “Edit/Del” text hacks with Compact Button / Dropdown menu patterns.

## 5. Implementation checklist (every UI PR)

- [ ] No new `window.alert|confirm|prompt`.
- [ ] Feedback uses Toast / Alert / Notification / Banner / Modal per decision tree.
- [ ] Reused `components/ui/*` or ported AlignUI block; no one-off styled `<div>` systems.
- [ ] Huge Icons only; `Button` `w-fit`; modal `rounded-20`.
- [ ] Loading / empty / error / success states present and token-styled.
- [ ] Focus management: modals trap focus; icon buttons have `aria-label`; errors linked via
      `aria-describedby` / `aria-invalid` on inputs.
- [ ] Responsive: no broken mobile layouts; full-width buttons only when intentional on small screens.
- [ ] If unsure which component: re-read this skill → open AlignUI docs page → else `find-skills`.

## 6. When in doubt

1. Read the matching page under `https://www.alignui.com/docs/v1.2/ui/<component>`.
2. Copy the AlignUI source into `client/src/components/ui/`, adapt icons/tokens.
3. If the problem is broader (a11y, design-system architecture), run **`find-skills`** and consider
   installing a high-quality skill (prefer ≥1K installs, known owners) rather than improvising.
4. Stop and ask the user only when choosing a new visual language that conflicts with AlignUI or
   existing tokens.
