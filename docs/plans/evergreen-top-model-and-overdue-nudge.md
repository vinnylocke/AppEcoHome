# Evergreen-exclusive top AI model + 8pm overdue-tasks nudge

**Date:** 2026-07-08 · Two user requests, scoped via Q&A: (1) the highest Gemini model becomes Evergreen-only — Sage keeps Pro-class AI via `gemini-2.5-pro` (no downgrade shock); (2) an evening overdue-tasks reminder at 8pm **local**, as a new toggleable notification category (default ON).

**App-reference consulted:** `99-cross-cutting/13-ai-gemini.md`, `99-cross-cutting/17-tier-gating.md`, `99-cross-cutting/35-agent-tools.md`, `99-cross-cutting/11-cron-jobs.md`, `99-cross-cutting/12-notifications.md`, `06-account/02-notifications-tab.md`.

---

## Part 1 — top Gemini model Evergreen-only

### Code

- **`supabase/functions/agent-chat/chatModels.ts`** — three cascades:
  - `CHAT_MODELS_EVERGREEN = ["gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-2.5-flash"]` (today's PRO list)
  - `CHAT_MODELS_SAGE = ["gemini-2.5-pro", "gemini-3-flash-preview", "gemini-2.5-flash"]` (Pro-class, minus the top rung)
  - `CHAT_MODELS_FLASH` unchanged.
  - `modelsForTier`: `evergreen` → EVERGREEN, `sage` → SAGE, else FLASH.
- **`supabase/functions/agent-chat/appFacts.ts`** — PRICING line gains: Evergreen runs Rhozly's most advanced AI model in this chat (so the AI can answer "what's the difference?" truthfully).
- **Tests** — `agentChatModels.test.ts` rewritten for the three-way split (top rung present ONLY in evergreen's cascade; sage still Pro-led; sprout/botanist flash).

### Marketing (uncommitted kit — regenerate collateral after edits)

- `marketing/app-store/listing-copy/{apple-app-store,google-play}.md` — "powered by Google's Gemini Pro models — with our most advanced model exclusive to Evergreen."
- `marketing/_src/app-store-listing.html` — same rewording in the GARDEN AI paragraph + feature bullet.
- `marketing/_src/build/render-collateral.mjs` + `one-pager.html` + `feature-sheet.html` — Sage blurb unchanged (still Gemini-Pro-powered, true); Evergreen blurb → "Everything — unlimited Garden AI on our most advanced model, highest limits, smart-sensor integrations."
- Handover doc (scratchpad HTML → `Rhozly-Beta-Handover.pdf`) — tier-matrix Garden AI row notes Evergreen = most advanced model.
- Re-render: `html-to-pdf` for the listing/one-pager/feature-sheet + handover PDF.

### Technical docs

- `13-ai-gemini.md` — chat cascade section becomes per-tier (evergreen/sage/flash).
- `17-tier-gating.md` — Garden AI chat row gains the model split.
- `35-agent-tools.md` — Tier gating section notes the per-tier cascade.

### Risk

Sage answer quality: round-7 eval measured the **Pro-class** uplift; `gemini-2.5-pro` retains it (the 3.1-preview top rung was an increment, not the step-change). No eval re-run needed now; the next scheduled run will use the evergreen demo account (unchanged behaviour).

---

## Part 2 — 8pm overdue-tasks nudge

**Design decision:** NOT a new cron. `daily-batch-notifications` already runs every 15 min and self-gates per user's **local** time with atomic `(user, kind, local date)` claims in `notification_claims`. A new UTC-8pm cron would hit every timezone at the wrong hour and re-implement send-once. The nudge is a new **kind** inside the existing run.

### Code

- **`_shared/notificationPrefs.ts`** — add `overdueEvening?: boolean` to `NotificationPrefs` (sparse jsonb; missing = ON, consistent with the others).
- **`daily-batch-notifications/index.ts`** — new kind `overdue_evening`:
  - Time gate: `isReminderDue(localMinutes, "20:00")` per home timezone (fixed 8pm; the existing digest's custom `reminderTime` stays morning-only).
  - Content gate: user has ≥1 task overdue against the home's **local** date (same snooze/harvest-window filtering contract as the digest — reuse the existing pending-tasks fetch, filtered to `due_date < localToday`).
  - Pref gate: `shouldNotify(prefs, "overdueEvening")`.
  - Claim kind `overdue_evening` → push "Still 5 tasks overdue — fancy a quick evening catch-up? 🌿" deep-linking to `/dashboard`.
  - One nudge per user per local day (in-run dedupe by user, same as the digest).
- **`src/components/GardenerProfile.tsx`** — new Alerts category row `overdueEvening` ("Evening overdue nudge" / "An 8pm reminder when tasks are still overdue"), default `true` in the prefs default object. Toggle testid comes free (`notifications-toggle-overdueEvening`).

### Tests

- Deno: extend the notification-prefs/timing test files — `shouldNotify` honours `overdueEvening: false`; 20:00 tick-window gating (19:59 no / 20:00–20:14 yes) via `isReminderDue`.
- Vitest: none needed (GardenerProfile categories aren't unit-tested; the row is declarative data).

### Docs

- `11-cron-jobs.md` — Daily Batch Notifications row gains the `overdue_evening` kind.
- `12-notifications.md` — new kind documented.
- `06-account/02-notifications-tab.md` — new category row (both roles).
- `docs/e2e-test-plan/12-profile.md` — note the new toggle if the profile section lists them.

---

## Ship

`npm run test:functions` + `npm run typecheck` + `npm run test:unit` + `npm run build` → release notes → deploy `--bump 1` → push → regenerate marketing PDFs (uncommitted).
