# #12 — IA reorg: `/calendar` section + "Plan" rename (XL, two slices)

## Target IA (owner-locked)
- New top-level **"Calendar"** section at **`/calendar`** with tabs **Calendar · Weather · Routines**.
- Calendar + Weather **leave the Dashboard** (`?view=` pills + persistence deleted).
- **Routines leaves Planner** for the Calendar section; old **`/schedule` → `/calendar?tab=routines`** redirect.
- Planner + Shopping grouping **renamed "Plan"** (ToolsHub `/tools` untouched).
- New sections live in **More / Shelf** — the mobile Deck stays Home/Plants/Capture/Tasks/More.

## Current wiring (investigated — the exact surface area)
- **`TAB_URL`** (App.tsx:212) — nav id → url.
- **`navLinks`** (App.tsx:1379–1410) — groups `garden` / `plan` / `ai`. Relevant: `planner` (matchPaths `/planner /shopping /schedule`, group `plan`), `journal` (group `plan`).
- **Deck** (App.tsx:1431+) — parallel 5-slot mobile bar (Home, Plants, + Capture/Tasks/More actions). Does NOT use `navLinks`.
- **Dashboard `?view=`** (App.tsx:525–559) — `dashboardView: "home"|"calendar"|"weather"`, persisted to `localStorage["rhozly_dashboard_view"]`; the 3-pill switcher at App.tsx:1794; the calendar/weather panels render inside HomeMain/Dashboard.
- **PlannerHub** — Planner/Shopping/**Routines** tabs. `/schedule` renders the same BlueprintManager (Routines).

### Deep-link callers to codemod (13 sites — repoint atomically)
| File:line | Current | New |
|---|---|---|
| App.tsx:1794 | `?view=${v}` switcher | (switcher removed — calendar/weather leave the dashboard) |
| CaptureSheet.tsx:33 | `/dashboard?view=calendar&open=add-task` | `/calendar?open=add-task` |
| GlobalQuickAdd.tsx:20 | `/dashboard?view=calendar&open=add-task` | `/calendar?open=add-task` |
| HomeStatusStrip.tsx:247 | `/dashboard?view=calendar` | `/calendar` |
| HomeStatusStrip.tsx:255 | `/dashboard?view=weather` | `/calendar?tab=weather` |
| HomeMain.tsx:356 | `/dashboard?view=calendar` | `/calendar` |
| NextBestAction.tsx:57 | `/dashboard?view=calendar` | `/calendar` |
| WeeklyOverviewPage.tsx:345 | `/dashboard?view=calendar` | `/calendar` |
| WeatherAlertBanner.tsx:239 | `/dashboard?view=weather` | `/calendar?tab=weather` |
| TodayTasksTray.tsx:130 | `/dashboard?view=calendar` | `/calendar` |
| TaskList.tsx:1485 | `/dashboard?view=calendar` | `/calendar` |
| heroSentence.ts:138,146 | `/dashboard?view=calendar` | `/calendar` |
| heroSentence.ts:155,164 | `/dashboard?view=weather` | `/calendar?tab=weather` |

## Slice 1 — Calendar section + Dashboard declutter (the big, risky slice)
1. **New `CalendarHub`** (`src/components/CalendarHub.tsx`) — a `SegmentedTabs` shell (mirror `JournalNotesHub`) reading `?tab=` (`calendar` default · `weather` · `routines`), rendering `TaskCalendar` / the weather panel / `BlueprintManager`. Extract the weather panel from the Dashboard `?view=weather` branch.
2. **Route** — add `/calendar` → `CalendarHub` (lazy). Add `/schedule` → `<Navigate to="/calendar?tab=routines" replace />` (keep the old URL alive).
3. **Dashboard** — delete the `calendar`/`weather` from `DashboardView` (App.tsx:525–559), the 3-pill switcher (1794), and the `rhozly_dashboard_view` persistence of those. Dashboard becomes home-only → declutter ✅.
4. **Nav** — add a `calendar` entry to `TAB_URL` + `navLinks` (new group/section, in the Shelf; NOT a Deck slot). Remove `/schedule` from `planner`'s matchPaths; add `/calendar` + `/schedule` to the new calendar item's matchPaths.
5. **Routines** — remove the Routines tab from PlannerHub (it now lives in CalendarHub). Confirm no other entry point breaks.
6. **Codemod** the 13 caller sites above.
7. **Tests** — update `layout.spec.ts` NAV-*/DASH-* (the 3-pill switcher tests, e.g. DASH-002/003/MOBILE-001) + page objects; add CAL-* rows for the new section. Update `docs/e2e-test-plan/05-dashboard.md` + a new `docs/e2e-test-plan/NN-calendar.md`.
8. **Docs** — `21-routing.md` (the `/calendar` section, `/schedule` redirect, retire `?view=`), `09-persistent-ui` nav refs, the dashboard + planner surface refs, a new calendar-section app-reference file.

## Slice 2 — "Plan" rename (small, independent)
9. Rename the `plan` group's user-facing label to **"Plan"** (Planner + Shopping). ToolsHub `/tools` untouched. Update the nav-group label + any Shelf section heading + docs.

## Risks / why this is XL
- **The 13 deep-link callers must be repointed in the same change** or they 404/misroute (the triage's headline risk).
- **App.tsx routing surgery** (dashboard view state + persistence + switcher) is load-bearing — a mistake regresses the whole home screen.
- **`layout.spec.ts`** asserts the 3-pill switcher (DASH-002/003, DASH-MOBILE-001) — those must move to the new section in the same task or the suite breaks.
- Each slice independently declutters the dashboard, so they can ship separately.

## Verification
`npm run typecheck` + `npm run test:unit` + the E2E layout spec, then `npm run build`, after each slice.
