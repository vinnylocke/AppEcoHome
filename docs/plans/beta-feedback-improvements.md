# Plan — Beta feedback improvements

## Goals

1. **Prompts re-appear on repeated actions** — only skip a context if the user actually submitted feedback for it. Dismissing just starts a 60s cooldown; it no longer permanently suppresses that context for the session.
2. **Beta banner** — a sticky banner directly below the app header (beta users only) in a visually distinct colour so it's clear the user is on a beta build. Contains a "Leave Feedback" button that opens a general feedback modal.

---

## Change 1 — Prompt persistence

### Problem
`useBetaFeedback` puts every shown context into `sessionStorage` whether the user submitted or dismissed. So dismissing a prompt means it never appears again that session.

### Fix — `src/hooks/useBetaFeedback.ts`
- Rename key to `rhozly_beta_feedback_submitted` — tracks **submitted** contexts only.
- Remove `MAX_PER_SESSION` entirely.
- `requestFeedback`: skip only if the context is in the submitted list (not just "seen"). Cooldown still blocks immediate re-shows.
- `clearPending` (dismiss path): reset pending and start cooldown — do NOT add to submitted list.
- `submitFeedback`: write to DB, add context to submitted list, start cooldown.

---

## Change 2 — Beta banner

### Design
- Sticky strip directly **below the app header**, full width
- Visually distinct colour — amber (`bg-amber-400 text-amber-950`) so it immediately signals "you're in test mode"
- Left side: label e.g. `🧪 Beta — You're helping test Rhozly`
- Right side: `[ Leave Feedback ]` button (darker amber pill)
- Visible only when `isBeta` is true (read from `BetaFeedbackContext`)
- Height is small (~36px) — not intrusive but unmissable

### Placement in App.tsx
Rendered as a sibling just below `<header>`, inside the existing layout `div`, before the sidebar+content area. This means it scrolls with nothing — it's sticky under the header at all times.

### Modal (opened by "Leave Feedback")
- Centered overlay modal (same portal as `BetaFeedbackSheet`)
- Heading: "Share Feedback"
- Optional dropdown: "What area? (optional)" — lists all 11 contexts + "General" as default
- Required textarea: "Tell us what you think…"
- Submit → inserts into `beta_feedback`:
  - `action_context`: selected context key or `"general"`
  - `ratings: {}`
  - `description`: textarea value
  - `metadata: { source: "manual" }`
- On success: toast "Thanks for your feedback!", close modal

### `BetaFeedbackContext.tsx` change
Expose `isBeta` and `userId` in the context value so `BetaFeedbackBanner` can self-gate and submit without prop-drilling.

---

## Files

### Modified
| File | Change |
|------|--------|
| `src/hooks/useBetaFeedback.ts` | Submitted-only tracking, remove MAX_PER_SESSION |
| `src/context/BetaFeedbackContext.tsx` | Add `isBeta` + `userId` to context value |
| `src/App.tsx` | Render `<BetaFeedbackBanner />` below the header |

### New
| File | Purpose |
|------|---------|
| `src/components/BetaFeedbackBanner.tsx` | Amber sticky banner + general feedback modal |

---

## No migration needed
The existing `beta_feedback` table supports `action_context: "general"` already (text column, no constraint).
