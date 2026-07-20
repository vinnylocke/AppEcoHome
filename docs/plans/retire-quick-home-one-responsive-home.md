# Retire the phone `/quick` home — one responsive home for phone + PC

**Status:** Approved (user confirmed "one responsive home", 2026-07-20). Implementing.
**Goal (user):** "Do we need the quick menu for phone? Ideally I don't want an extra screen — more of an optimised experience for phone and PC using responsive design."

## Problem

The app has **two home screens**: `/` redirects phone → `/quick` (`QuickAccessHome`, a focus-mode launcher) and desktop → `/dashboard` (`HomeMain`). But `/quick` duplicates the dashboard's *simple* density — greeting, today's tasks, seasonal picks, Garden Walk CTA — and its customisable launcher **is literally the same one** the dashboard uses (`QuickActionsRow` "reuses the /quick launcher catalogue + saved pins so customisation carries across surfaces"). `/quick` is also focus-mode (no header/Deck), so the phone's *landing* screen has different chrome than the rest of the app.

## Decision

Land **both** phone and PC on the one responsive `/dashboard` (simple density on phone = the fast glanceable view; two-column studio on desktop). Retire the `/quick` home, the mobile-only "Quick" nav item, and QuickAccessHome. Keep the genuinely-unique `/quick/calendar` planting/rain helper (reached via the dashboard's "Today" launcher tile), still in focus-mode.

## App-reference consulted

- `99-cross-cutting/21-routing.md` (the `/`→`/quick`|`/dashboard` redirect + focus-mode), `02-dashboard/09-quick-access-home.md`, `02-dashboard/17-home-main.md`, `02-dashboard/10-localized-task-calendar.md`, `09-persistent-ui/02-sidebar.md` + `11-bottom-tab-bar.md` (the Quick nav item).

## Changes

**Code (src/App.tsx unless noted):**
1. `/` redirect (~1666): `isMobile ? "/quick" : "/dashboard"` → always `"/dashboard"`.
2. Remove the mobile-only "Quick" nav item (~1374) + its now-unused `Zap` import if orphaned.
3. `/quick` route (~1668): `QuickAccessHome` → `<Navigate to="/dashboard" replace />`.
4. Remove the `QuickAccessHome` lazy import (~98).
5. `isFocusMode` stays `isWalk || (isMobile && startsWith("/quick"))` — now only `/quick/calendar` benefits (the `/quick` redirect never paints); update the comment.
6. `src/components/quick/LocalizedTaskCalendar.tsx` back button: `navigate("/quick")` → `navigate("/dashboard")`, aria-label "Back to Quick Access" → "Back to dashboard".
7. Delete `src/components/QuickAccessHome.tsx` (retired).

**Tests:**
8. Delete `tests/unit/components/QuickAccessHome.test.ts` (component retired). Keep `QuickTile.test.ts` (QuickTile still powers the dashboard launcher).
9. `tests/e2e/specs/quick-access.spec.ts`: repoint to assert (a) `/` and `/quick` land on `/dashboard`, (b) the launcher + Customise live on the dashboard (`home-quick-actions`). Retire the `/quick`-home-specific rows.

**Docs:**
10. `21-routing.md` (redirect + focus-mode now `/quick/calendar` only), `09-quick-access-home.md` (mark **RETIRED** — folded into the responsive dashboard), `17-home-main.md` (now the sole home for both platforms), sidebar + bottom-tab-bar (drop the Quick item note), `00-INDEX.md` (mark 09 retired), e2e-test-plan quick-access section.

## Risks

- **New-user phone landing** is now the dashboard (heavier than `/quick`), but it's the responsive home and soft-fails on telemetry. The `dashboard_tour` already targets simple-density testids, so new phone users get the right tour.
- `/quick` deep-links (launcher "Today" tile → `/quick/calendar` unaffected; any bare `/quick` → redirects to `/dashboard`).
- No data-model / edge-function / tier change.

## What we keep / lose

Keep: `/quick/calendar` planting helper; the customisable launcher (already on the dashboard); all tiles/tasks/picks/walk. Lose: nothing unique — only the duplicate second home + its inconsistent focus-mode chrome.
