# 7. Task Schedule (BlueprintManager)

**Spec files:** `tests/e2e/specs/schedule.spec.ts` · `tests/e2e/specs/schedule-validation.spec.ts` · `tests/e2e/specs/schedule-optimise.spec.ts` · `tests/e2e/specs/tasks.spec.ts`
**Page Object:** `tests/e2e/pages/SchedulePage.ts`
**Seed dependencies:** `03_tasks_blueprints.sql`
**App-reference:** [04-planner/](../app-reference/04-planner/)

Covers `/schedule` (Routines + Suggestions/Optimise tabs).

## Navigation + basic render

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SCH-001 | ✅ | "Automations" / "Routines" heading | — | ✅ Passing |
| SCH-002 | ✅ | Nav link → `/schedule` | — | ✅ Passing |
| SCH-003 | ✅ | Seeded blueprint cards render | — | ✅ Passing |
| SCH-004 | ✅ | Card shows task-type badge | — | ✅ Passing |
| SCH-005 | ✅ | Card shows frequency ("Every 7 Days") | — | ✅ Passing |
| SCH-006 | ✅ | Empty state — "No Automations Running" + CTA | — | ✅ Passing |

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
| SCH-V-004 | ✅ | Pause toggle visible on seeded card | — | ✅ Passing |
| SCH-V-005 | ✅ | Pause toggle opens 7d / 14d / 30d options | — | ✅ Passing |
