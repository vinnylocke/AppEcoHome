# 7. Routines (BlueprintManager)

**Spec files:** `tests/e2e/specs/schedule.spec.ts` · `tests/e2e/specs/schedule-validation.spec.ts` · `tests/e2e/specs/schedule-optimise.spec.ts` · `tests/e2e/specs/tasks.spec.ts`
**Page Object:** `tests/e2e/pages/SchedulePage.ts`
**Seed dependencies:** `03_tasks_blueprints.sql`
**App-reference:** [04-planner/](../app-reference/04-planner/)

Covers `/schedule` (Routines + Suggestions/Optimise tabs).

> **Phase 4.5 (design overhaul) — Routines card redesign + locator repairs.** The Routines cards are now colour-coded by task type (left accent bar + tinted icon tile + dot-track, all one hue per type), the "Next: date · date · date" footnote is replaced by a single "Next:" line plus a 30-day dot track (`blueprint-{id}-dot-track`), pause + delete controls are now **always visible** (were hover-only, invisible to touch), and the **Filters** button shows a real active-filter count instead of a "!". As part of this pass the suites were repaired for the long-standing Automations→Routines rename: `SchedulePage` now uses the "Search routines…" placeholder, "No routines yet" empty state, "Create your first routine" CTA, the filter drawer `getByRole` heading "Filters", the modal heading `/New Routine|Edit Routine/`, and `tasks.spec` targets the `/Routines/` heading; the delete-confirm path now clicks `confirm-modal-confirm`. A **pre-existing SCH-011 failure** was also fixed — the test lacked a `window.confirm` dialog-accept handler for the duplicate-schedule prompt that area-linked saves fire (Playwright auto-dismisses by default, silently aborting the save; a stash test confirmed it failed on committed code too). **Schedule suites are now 42/42.** The tour anchors (`schedule-heading`, `blueprint-new-btn`, `blueprint-list`) are unchanged, and the pause/delete `data-testid`s + aria-labels are preserved.

## Navigation + basic render

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SCH-001 | ✅ | "Automations" / "Routines" heading | — | ✅ Passing |
| SCH-002 | ✅ | Nav link → `/schedule` | — | ✅ Passing |
| SCH-003 | ✅ | Seeded blueprint cards render | — | ✅ Passing |
| SCH-004 | ✅ | Card shows task type — now via the colour-coded card (accent bar + tinted icon tile, hue per type) rather than a text badge | — | ✅ Passing |
| SCH-005 | ✅ | Card shows frequency ("Every 7 Days") | — | ✅ Passing |
| SCH-B14 | ✅ | Closing the routine editor with unsaved changes shows the in-app ConfirmModal "Discard changes?" (not `window.confirm`); Cancel keeps the draft intact (dashboard-nav-tasks-tray Stage 3, B14) | — | ✅ Passing |
| SCH-006 | ✅ | Empty state — "No routines yet" + "Create your first routine" CTA | — | ✅ Passing |
| SCH-040 | 🔲 | Card renders 30-day dot track (`blueprint-{id}-dot-track`) with occurrence dots for a seeded recurring routine | — | 🔲 Planned |
| SCH-041 | 🔲 | Filters button shows active-filter count badge (e.g. `1` after one filter applied, hidden when none) | — | 🔲 Planned |

## Create blueprint

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SCH-007 | ✅ | New Automation opens modal | — | ✅ Passing |
| SCH-008 | ✅ | Create happy path | — | ✅ Passing |
| SCH-009 | ❌ | Empty title validation | — | ✅ Passing |
| SCH-010 | ✅ | All task types in dropdown | — | ✅ Passing |
| SCH-011 | ✅ | With inventory link — Basil badge on card | — | ✅ Passing |
| SCH-012 | ✅ | With location — location badge on card | — | ✅ Passing |
| SCH-013 | ✅ | With seasonal dates — saved | — | ✅ Passing |
| SCH-014 | ✅ | Cancel / Escape closes modal without saving | — | ✅ Passing |

## Edit blueprint

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SCH-015 | ✅ | Click card opens edit modal pre-filled | — | ✅ Passing |
| SCH-016 | ✅ | Edit title — updated on card | — | ✅ Passing |
| SCH-017 | ✅ | Edit frequency — updated badge | — | ✅ Passing |
| SCH-018 | ✅ | Edit task type | — | ✅ Passing |

## Delete blueprint

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SCH-019 | ✅ | Delete confirm removes it + toast | — | ✅ Passing |
| SCH-020 | ✅ | Cancel on delete leaves blueprint | — | ✅ Passing |
| SCH-021 | ✅ | Delete removes linked ghost tasks | — | ✅ Passing |

## Search + filter

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SCH-022 | ✅ | Search matching ("Watering") | — | ✅ Passing |
| SCH-023 | ❌ | Search no-match — "No matches found" | — | ✅ Passing |
| SCH-024 | ✅ | Filter panel opens | — | ✅ Passing |
| SCH-025..027 | ✅ | Filter by task type (Watering / Pruning / Pest Control) | — | ✅ Passing |
| SCH-028 | ✅ | Clear All resets filters | — | ✅ Passing |

## Optimise / Suggestions tab (PR 7)

Adds a Greenhouse fragmentation pair (`BP_OPT_FRAG_A_ID` + `BP_OPT_FRAG_B_ID` — Cucumber/Pepper Watering, freqs 7 vs 3) so SCH-032 → SCH-039 are deterministic.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SCH-029 | ✅ | Tab bar — `tab-blueprints` + `tab-optimise` both visible | — | ✅ Passing |
| SCH-030 | ✅ | Switch to Optimise → scope toggle + Analyse button (disabled without area) | — | ✅ Passing |
| SCH-031 | ✅ | South Border (1 BP only) → `optimise-all-good` empty state | — | ✅ Passing |
| SCH-032 | ✅ | Greenhouse pair → at least one `proposal-card-*` | — | ✅ Passing |
| SCH-033 | ✅ | Toggle proposal `proposal-toggle-*` → `optimise-selected-count` decrements | — | ✅ Passing |
| SCH-034 | ✅ | Apply → `confirm-modal-confirm` → "Applied N optimisation" toast → new `session-row-*` | — | ✅ Passing |
| SCH-035 | ✅ | Click `undo-session-*` → "Optimisation reversed" toast | — | ✅ Passing |
| SCH-036 | ❌ | AI Analyse hidden when `ai_enabled=false` | `user_profiles` GET | ✅ Passing |
| SCH-037 | ✅ | AI Analyse populates proposals (mocked) | `optimise-area-ai` edge fn | ✅ Passing |
| SCH-038 | ✅ | Thumbs-up disables feedback buttons | edge fn + `optimiser_proposal_feedback` | ✅ Passing |
| SCH-039 | ✅ | Regenerate AI results opens reason modal | `optimise-area-ai` edge fn | ✅ Passing |

## Edge cases + filter cascade + pause UI

**Spec file:** `tests/e2e/specs/schedule-validation.spec.ts`

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SCH-V-001 | ❌ | Frequency input has `min="1"` (UI guard against 0) | — | ✅ Passing |
| SCH-V-002 | ✅ | Filter Location → Area cascade — Area ENABLED on real location | — | ✅ Passing |
| SCH-V-003 | ✅ | Filter Location → Area cascade — Area DISABLED on "Unassigned (None)" | — | ✅ Passing |
| SCH-V-004 | ✅ | Pause toggle always visible on seeded card (Phase 4.5 — no longer hover-gated, so touch users see it) | — | ✅ Passing |
| SCH-V-005 | ✅ | Pause toggle opens 7d / 14d / 30d options | — | ✅ Passing |
