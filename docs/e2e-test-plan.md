# Rhozly — E2E Test Plan

## How to use this document

This is the living test plan for Rhozly's Playwright E2E suite. Update it whenever:
- A new feature or route is added → add a new section
- A test is implemented → change `🔲 Planned` to `✅ Passing`
- A test breaks → change to `❌ Failing` and note the cause
- A selector, heading, or button label changes → update any affected test rows and the relevant Page Object entry

**Test types:** ✅ Positive (happy path / expected behaviour) | ❌ Negative (error, invalid input, edge case)

**Status legend:** `🔲 Planned` | `🚧 In Progress` | `✅ Passing` | `❌ Failing`

---

## Parallel Worker Accounts & Seed UUIDs

E2E tests run with up to **4 parallel workers**, each backed by its own isolated Supabase account. Worker accounts are assigned automatically from `PLAYWRIGHT_WORKER_INDEX` in `tests/e2e/fixtures/auth.ts` — no `TEST_USER_EMAIL` env var is needed. Each account has a distinct UUID prefix so workers never share data.

| Worker index | Account | UUID prefix |
|---|---|---|
| 0 | `test1@rhozly.com` | `00000001-0000-0000-` |
| 1 | `test2@rhozly.com` | `00000002-0000-0000-` |
| 2 | `test3@rhozly.com` | `00000003-0000-0000-` |
| 3 | `test4@rhozly.com` | `00000004-0000-0000-` |

Password for all accounts: `TestPassword123!`

The bootstrap seed (`00_bootstrap.sql`) creates all 4 accounts with the fixed UUIDs below. The table shows values for **worker 0** (`test1@rhozly.com`) — replace the `00000001` prefix with `00000002`–`00000004` for the other workers.

```
-- Worker 0 (test1@rhozly.com) — replace 00000001 prefix for other workers
TEST_USER_ID         = 00000001-0000-0000-0000-000000000001
TEST_HOME_ID         = 00000001-0000-0000-0000-000000000002

-- Locations
LOC_GARDEN_ID        = 00000001-0000-0000-0001-000000000001  (Outside Garden)
LOC_INDOOR_ID        = 00000001-0000-0000-0001-000000000002  (Indoor Space)

-- Areas
AREA_RAISED_BED_ID   = 00000001-0000-0000-0002-000000000001  (Raised Bed A)
AREA_BORDER_ID       = 00000001-0000-0000-0002-000000000002  (South Border)
AREA_GREENHOUSE_ID   = 00000001-0000-0000-0002-000000000003  (Greenhouse)
AREA_WINDOWSILL_ID   = 00000001-0000-0000-0002-000000000004  (Kitchen Windowsill)
AREA_LIVING_ROOM_ID  = 00000001-0000-0000-0002-000000000005  (Living Room)

-- Plants (integer PKs — unique per worker, NOT UUIDs)
PLANT_TOMATO_ID      = 1000011  (Tomato — manual, active)       -- worker 0
PLANT_BASIL_ID       = 1000012  (Basil — manual, active)
PLANT_ROSE_ID        = 1000013  (Rose — manual, active)
PLANT_FERN_ID        = 1000014  (Boston Fern — manual, active)
PLANT_ARCHIVED_ID    = 1000015  (Mint — archived)
PLANT_API_ID         = 1000016  (Lavender — api source)
-- Note: worker N plants use IDs 100000(N*10 + 1) through 100000(N*10 + 6)

-- Inventory items (plant instances)
INV_TOMATO_ID        = 00000001-0000-0000-0003-000000000001  (Tomato — Unplanted/In Shed)
INV_BASIL_ID         = 00000001-0000-0000-0003-000000000002  (Basil — Planted in Raised Bed A)
INV_ROSE_ID          = 00000001-0000-0000-0003-000000000003  (Rose — Planted in South Border)
INV_FERN_ID          = 00000001-0000-0000-0003-000000000004  (Boston Fern — Planted on Windowsill)
INV_ARCHIVED_ID      = 00000001-0000-0000-0003-000000000005  (Mint — Archived)
INV_LAVENDER_ID      = 00000001-0000-0000-0003-000000000006  (Lavender — Unplanted/In Shed)

-- Task blueprints
BP_WATER_WEEKLY_ID   = 00000001-0000-0000-0004-000000000001  (Weekly Watering — all plants)
BP_WATER_BASIL_ID    = 00000001-0000-0000-0004-000000000002  (Basil Watering — linked to INV_BASIL)
BP_PRUNE_ROSE_ID     = 00000001-0000-0000-0004-000000000003  (Rose Pruning — seasonal)
BP_INSPECT_FERN_ID   = 00000001-0000-0000-0004-000000000004  (Fern Inspection — weekly)
BP_HARVEST_ID        = 00000001-0000-0000-0004-000000000005  (Tomato Harvest — recurring)
BP_FERTILIZE_ID      = 00000001-0000-0000-0004-000000000006  (Monthly Fertilizing)
BP_PEST_CONTROL_ID   = 00000001-0000-0000-0004-000000000007  (Pest Control — ailment type)
BP_MAINTENANCE_ID    = 00000001-0000-0000-0004-000000000008  (General Maintenance)

-- Standalone tasks (physical — no blueprint, fixed due dates relative to CURRENT_DATE)
TASK_PENDING_ID      = 00000001-0000-0000-0005-000000000001  (Pending — due CURRENT_DATE)
TASK_COMPLETED_ID    = 00000001-0000-0000-0005-000000000002  (Completed — CURRENT_DATE)
TASK_SKIPPED_ID      = 00000001-0000-0000-0005-000000000003  (Skipped — CURRENT_DATE - 1)
TASK_OVERDUE_ID      = 00000001-0000-0000-0005-000000000004  (Overdue Pending — CURRENT_DATE - 7)
TASK_FUTURE_ID       = 00000001-0000-0000-0005-000000000005  (Future Pending — CURRENT_DATE + 3)
TASK_WATERING_ID     = 00000001-0000-0000-0005-000000000006  (Watering — due CURRENT_DATE)
TASK_FERTILIZE_ID    = 00000001-0000-0000-0005-000000000007  (Fertilizing — due CURRENT_DATE + 1)
TASK_PRUNING_ID      = 00000001-0000-0000-0005-000000000008  (Pruning — due CURRENT_DATE + 5)
TASK_HARVEST_ID      = 00000001-0000-0000-0005-000000000009  (Harvesting — due CURRENT_DATE + 2)
TASK_INSPECT_ID      = 00000001-0000-0000-0005-000000000010  (Inspection — due CURRENT_DATE)
TASK_PEST_ID         = 00000001-0000-0000-0005-000000000011  (Pest Control — due CURRENT_DATE)
TASK_MAINTAIN_ID     = 00000001-0000-0000-0005-000000000012  (Maintenance — due CURRENT_DATE + 1)
TASK_PLANTING_ID     = 00000001-0000-0000-0005-000000000013  (Planting — due CURRENT_DATE, linked to Tomato inv)

-- Ailments
AILMENT_APHID_ID     = 00000001-0000-0000-0007-000000000001  (Aphid — pest, active)
AILMENT_BLIGHT_ID    = 00000001-0000-0000-0007-000000000002  (Early Blight — disease, active)
AILMENT_IVY_ID       = 00000001-0000-0000-0007-000000000003  (Japanese Knotweed — invasive_plant)
AILMENT_ARCHIVED_ID  = 00000001-0000-0000-0007-000000000004  (Powdery Mildew — disease, archived)

-- Plans
PLAN_ACTIVE_ID       = 00000001-0000-0000-0008-000000000001  (Summer Veg Plan — In Progress)
PLAN_COMPLETED_ID    = 00000001-0000-0000-0008-000000000002  (Spring Cleanup — Completed)
PLAN_ARCHIVED_ID     = 00000001-0000-0000-0008-000000000003  (Winter Prep — Archived)

-- Guides (shared across all workers — not worker-specific)
GUIDE_WATERING_ID    = 00000000-0000-0000-0009-000000000001  (Watering Basics — Beginner)
GUIDE_PRUNING_ID     = 00000000-0000-0000-0009-000000000002  (Pruning Techniques — Intermediate)
GUIDE_COMPOSTING_ID  = 00000000-0000-0000-0009-000000000003  (Composting 101 — Beginner)
```

---

## Seed Script Reference

Seeds are run via the npm script which applies all 9 seed files across all 4 worker accounts:

```bash
# Recommended: seed all 4 workers then run all E2E tests
npm run test:e2e:fresh

# Seed only (idempotent — safe to re-run at any time without resetting)
npm run test:seed

# Full reset + seed (wipes DB and re-applies migrations — use when migrations changed)
supabase db reset --local && npm run test:seed
```

All seed files are idempotent (`ON CONFLICT DO UPDATE`) — re-running is always safe. Seeds that reference `CURRENT_DATE` (tasks, weather) refresh those rows to stay relative to today.

**Seed files applied in order for each worker account:**

| File | Contents |
|------|----------|
| `00_bootstrap.sql` | Auth user, profile, home, home_members |
| `01_locations_areas.sql` | 2 locations, 5 garden areas |
| `02_plants_shed.sql` | 6 plants + 6 inventory items |
| `03_tasks_blueprints.sql` | 8 blueprints + 13 standalone tasks |
| `04_weather.sql` | 7-day forecast + 4 weather alerts |
| `05_planner.sql` | 3 plans |
| `06_ailments_watchlist.sql` | 4 ailments |
| `07_guides.sql` | 3 guides |
| `08_profile_preferences.sql` | Quiz completion + 5 preferences |

> **Lost or corrupted seed data?** Run `npm run test:seed` to restore state. Each seed file is independent.

---

## Section 01 — Authentication

**Spec file:** `tests/e2e/specs/auth.spec.ts`
**Page Object:** `tests/e2e/pages/AuthPage.ts`
**Seed required:** `00_bootstrap.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| AUTH-001 | Sign-in form renders | ✅ | Navigate to `/` unauthenticated → sign-in heading + email/password inputs visible | None | — | ✅ Passing |
| AUTH-002 | Sign in — valid credentials | ✅ | Enter `test@rhozly.com` + correct password → redirected to `/dashboard` | Bootstrap | — | ✅ Passing |
| AUTH-003 | Sign in — wrong password | ❌ | Enter valid email + wrong password → error message visible, no redirect | Bootstrap | — | ✅ Passing |
| AUTH-004 | Sign in — empty email | ❌ | Submit form with blank email → email validation error visible | None | — | ✅ Passing |
| AUTH-005 | Sign in — invalid email format | ❌ | Enter `notanemail` → format error, form not submitted | None | — | ✅ Passing |
| AUTH-006 | Sign in — empty password | ❌ | Submit with blank password → error visible | None | — | ✅ Passing |
| AUTH-007 | Sign out | ✅ | Authenticated → click Sign Out → redirected to auth page | Bootstrap | — | ✅ Passing |
| AUTH-008 | Session persistence | ✅ | Reload page after sign-in → still authenticated, dashboard shown | Bootstrap | — | ✅ Passing |
| AUTH-009 | Auth guard — redirect unauthenticated | ✅ | Navigate to `/dashboard` without session → redirected to `/` | None | — | ✅ Passing |
| AUTH-010 | Root redirect — authenticated | ✅ | Navigate to `/` while authenticated → URL becomes `/dashboard` | Bootstrap | — | ✅ Passing |

---

## Section 02 — Dashboard (Main View)

**Spec file:** `tests/e2e/specs/weather.spec.ts` (weather) · `tests/e2e/specs/tasks.spec.ts` (tasks) · `tests/e2e/specs/dashboard.spec.ts` (to create)
**Page Object:** `tests/e2e/pages/DashboardPage.ts`
**Seed required:** `00_bootstrap.sql`, `01_locations_areas.sql`, `04_weather.sql`

### Weather Widget

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| DASH-001 | Weather card renders | ✅ | `/dashboard` → weather card visible with temperature and icon | Weather | — | ✅ Passing |
| DASH-002 | Three view tabs visible | ✅ | Locations, Calendar, Weather tabs all rendered | Bootstrap | — | ✅ Passing |
| DASH-003 | Weather tab click | ✅ | Click Weather tab → URL `?view=weather`, forecast panel visible | Weather | — | ✅ Passing |
| DASH-004 | Full Forecast button | ✅ | Click Full Forecast → 7-day forecast expands or navigates | Weather | — | ✅ Passing |
| DASH-005 | Weather code — Clear sky (WMO 0) | ✅ | Snapshot with wmoCode=0 → clear/sun icon rendered | Weather (04) | — | ✅ Passing |
| DASH-006 | Weather code — Rain (WMO 61) | ✅ | Snapshot with wmoCode=61 → rain icon rendered | Weather (04) | — | ✅ Passing |
| DASH-007 | Weather code — Snow (WMO 71) | ✅ | Snapshot with wmoCode=71 → snow icon rendered | Weather (04) | — | ✅ Passing |
| DASH-008 | Weather code — Thunderstorm (WMO 95) | ✅ | Snapshot with wmoCode=95 → CloudLightning icon rendered | Weather (04) | — | ✅ Passing |
| DASH-009 | Weather code — Fog (WMO 45) | ✅ | Snapshot with wmoCode=45 → fog icon rendered | Weather (04) | — | ✅ Passing |
| DASH-010 | Heat alert badge | ✅ | maxTempC=36 → heat alert indicator visible | Weather (04) | — | ✅ Passing |
| DASH-011 | Frost alert badge | ✅ | minTempC=0 day in forecast → frost alert visible | Weather (04) | — | ✅ Passing |
| DASH-012 | Rain alert badge | ✅ | precipMm > threshold → rain alert visible | Weather (04) | — | ✅ Passing |
| DASH-013 | Wind alert badge | ✅ | maxWindKph=65 → wind alert visible | Weather (04) | — | ✅ Passing |
| DASH-014 | No alerts — clear weather | ✅ | Mild forecast, no extreme values → no alert badges visible | Weather (04 mild day) | — | ✅ Passing |
| DASH-015 | Garden Intelligence panel | ✅ | GI panel renders with at least one rule heading | Weather (04) | — | ✅ Passing |
| DASH-016 | GI — Auto-watering rule visible | ✅ | Rain in forecast → "Auto-watering" rule shown in GI panel | Weather (04 rain day) | — | ✅ Passing |
| DASH-017 | GI — Frost protection rule | ✅ | Frost-risk day → frost rule visible in GI panel | Weather (04 frost day) | — | ✅ Passing |
| DASH-018 | GI — Heatwave rule | ✅ | maxTempC=36 → heatwave rule in GI panel | Weather (04 heat day) | — | ✅ Passing |
| DASH-019 | GI — High wind rule | ✅ | maxWindKph=65 → wind rule in GI panel | Weather (04 wind day) | — | ✅ Passing |

### Locations View

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| DASH-020 | Location tiles render | ✅ | `/dashboard` → location tile cards visible for seeded locations | Locations (01) | — | ✅ Passing |
| DASH-021 | Location tile shows name | ✅ | "Outside Garden" tile card rendered | Locations (01) | — | ✅ Passing |
| DASH-022 | Location tile — indoor badge | ✅ | "Indoor Space" tile shows indoor indicator | Locations (01) | — | ✅ Passing |
| DASH-023 | Click location tile → LocationPage | ✅ | Click tile → URL `?locationId=LOC_GARDEN_ID` | Locations (01) | — | ✅ Passing |
| DASH-024 | Quiz prompt banner — no quiz done | ✅ | Account without quiz completion → "Set up your Garden Profile" banner visible | Bootstrap | — | ✅ Passing |
| DASH-025 | Quiz prompt dismiss | ✅ | Click X on banner → banner disappears | Bootstrap | — | ✅ Passing |
| DASH-026 | Quiz prompt CTA → /profile | ✅ | Click "Get started" → URL becomes `/profile` | Bootstrap | — | ✅ Passing |
| DASH-027 | Quiz prompt gone — quiz complete | ✅ | Account with quiz completion → banner absent | Profile (08) | — | ✅ Passing |

### Daily Tasks Sidebar

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| DASH-028 | Daily Tasks heading | ✅ | "Daily Tasks" section heading visible | Bootstrap | — | ✅ Passing |
| DASH-029 | Pending tasks list | ✅ | Pending tasks visible in task list | Tasks (03) | — | ✅ Passing |
| DASH-030 | Empty state — no tasks | ✅ | No tasks → empty state message or prompt visible | Bootstrap (no tasks) | — | ✅ Passing |
| DASH-031 | Pending tab shows count | ✅ | Pending tab label includes task count | Tasks (03) | — | ✅ Passing |
| DASH-032 | Completed tab visible | ✅ | Completed tab rendered alongside Pending | Tasks (03) | — | ✅ Passing |
| DASH-033 | Completed tab click | ✅ | Click Completed tab → active style changes | Tasks (03) | — | ✅ Passing |
| DASH-034 | View Calendar link → calendar view | ✅ | Click "View Calendar" → URL `?view=calendar` | Bootstrap | — | ✅ Passing |
| DASH-035 | Overdue task visible | ✅ | Task due 7 days ago (Pending) → appears in task list | Tasks (03) | — | ✅ Passing |
| DASH-036 | Skipped task not in pending | ✅ | Skipped task does not appear in Pending tab | Tasks (03) | — | ✅ Passing |

---

## Section 03 — Dashboard (LocationPage)

**Spec file:** `tests/e2e/specs/dashboard.spec.ts`
**Page Object:** `tests/e2e/pages/DashboardPage.ts` (extend) or new `LocationDetailPage.ts`
**Seed required:** `01_locations_areas.sql`, `02_plants_shed.sql`, `03_tasks_blueprints.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| LOC-001 | LocationPage renders heading | ✅ | Navigate to `?locationId=LOC_GARDEN_ID` → "Outside Garden" heading | Locations | — | ✅ Passing |
| LOC-002 | Areas list visible | ✅ | Area cards (Raised Bed A, South Border) visible | Locations | — | ✅ Passing |
| LOC-003 | Planted plants shown on area | ✅ | Area card shows planted plant count or names | Plants (02) | — | ✅ Passing |
| LOC-004 | Area with no plants — empty state | ✅ | Greenhouse area has no plants → shows "No plants" message or empty state | Locations | — | ✅ Passing |
| LOC-005 | Indoor/Outdoor env toggle | ✅ | Click toggle → success toast, toggle state changes | Locations | — | ✅ Passing |
| LOC-006 | Indoor/Outdoor toggle — invalid if locked | ❌ | Feature does not exist — `toggleEnvironment()` fires unconditionally, no locked-toggle logic | Locations | — | ❌ N/A |
| LOC-007 | Area card drilldown | ✅ | Click area card → AreaDetails mounts, area name heading visible | Locations | — | ✅ Passing |
| LOC-008 | Area tasks list visible | ✅ | In area detail → tasks for that area listed | Tasks (03) | — | ✅ Passing |
| LOC-009 | Back from area detail | ✅ | Click back → area list view shown again | Locations | — | ✅ Passing |
| LOC-010 | Scan Area button visible | ✅ | Scan Area button present on area detail | Locations | — | ✅ Passing |
| LOC-011 | Area scan modal opens | ✅ | Click Scan Area → modal appears | Locations | `scan-area` mock | ✅ Passing |
| LOC-012 | Area scan — cancel | ✅ | Open scan modal, click cancel → modal closes | Locations | `scan-area` mock | ✅ Passing |
| LOC-013 | Area scan — result renders | ✅ | Mock scan response → result summary shown in modal | Locations | `scan-area` mock | ✅ Passing |
| LOC-014 | Back to dashboard from location | ✅ | Click back button → URL returns to `/dashboard` without `locationId` | Locations | — | ✅ Passing |
| LOC-015 | Non-existent locationId → graceful | ❌ | Navigate to `?locationId=00000000-bad-id` → graceful error or redirect | None | — | ✅ Passing |

---

## Section 04 — Dashboard (Calendar View)

**Spec file:** `tests/e2e/specs/dashboard.spec.ts`
**Page Object:** `tests/e2e/pages/DashboardPage.ts`
**Seed required:** `03_tasks_blueprints.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| CAL-001 | Calendar grid renders | ✅ | `/dashboard?view=calendar` → calendar grid visible | Bootstrap | — | ✅ Passing |
| CAL-002 | Current month heading | ✅ | Current month name visible in calendar header | Bootstrap | — | ✅ Passing |
| CAL-003 | Task dots on dates | ✅ | Dates with tasks show task indicator dots or count | Tasks (03) | — | ✅ Passing |
| CAL-004 | Ghost task dots — from blueprints | ✅ | Blueprint recurring dates show ghost task indicators | Tasks (03) | — | ✅ Passing |
| CAL-005 | Click date with tasks — opens panel | ✅ | Click date with tasks → task list for that date shown | Tasks (03) | — | ✅ Passing |
| CAL-006 | Click empty date — add task | ✅ | Click empty date cell → Add Task modal/form appears pre-filled with that date | None | — | ✅ Passing |
| CAL-007 | Navigate to next month | ✅ | Click next month → calendar grid updates to following month | Bootstrap | — | ✅ Passing |
| CAL-008 | Navigate to previous month | ✅ | Click previous month → calendar grid updates | Bootstrap | — | ✅ Passing |
| CAL-009 | Completed task on calendar | ✅ | Completed task date shows completed indicator/strikethrough | Tasks (03) | — | ✅ Passing |
| CAL-010 | Skipped task not shown as pending | ✅ | Skipped task date not shown as pending indicator | Tasks (03) | — | ✅ Passing |

---

## Section 05 — The Shed (Plant Inventory)

**Spec file:** `tests/e2e/specs/plants.spec.ts` · `tests/e2e/specs/shed-crud.spec.ts`
**Page Object:** `tests/e2e/pages/ShedPage.ts`
**Seed required:** `02_plants_shed.sql`, `01_locations_areas.sql`

### Navigation & Basic Render

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SHED-001 | Shed heading renders | ✅ | `/shed` → "The Shed" or "Plant Library" heading visible | Plants | — | ✅ Passing |
| SHED-002 | Search input visible | ✅ | Search input rendered | Plants | — | ✅ Passing |
| SHED-003 | Nav link navigates | ✅ | Click "The Shed" nav link → URL `/shed` | Plants | — | ✅ Passing |
| SHED-004 | Plant cards render | ✅ | Seeded plants appear as cards in the grid | Plants | — | ✅ Passing |

### Tabs & Filters

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SHED-005 | Active tab default | ✅ | Active tab shown by default, non-archived plants visible | Plants | — | ✅ Passing |
| SHED-006 | Archived tab — shows archived plants | ✅ | Click Archived → "Mint" (archived) visible | Plants | — | ✅ Passing |
| SHED-007 | Archived tab — active plants absent | ✅ | In Archived view → active plants (Tomato, Basil) not shown | Plants | — | ✅ Passing |
| SHED-008 | Filter by source — Manual | ✅ | Select "Manual" source → only manually-added plants shown | Plants | — | ✅ Passing |
| SHED-009 | Filter by source — API | ✅ | Select "API" source → only Lavender (api source) shown | Plants | — | ✅ Passing |
| SHED-010 | Search — matching result | ✅ | Type "Tomato" → only Tomato card visible | Plants | — | ✅ Passing |
| SHED-011 | Search — no match | ❌ | Type "xyzqwerty" → "No matches found" state shown, no plant cards | Plants | — | ✅ Passing |
| SHED-012 | Search — clears on Clear button | ✅ | After no-match search, click "Clear Search" → plants reappear | Plants | — | ✅ Passing |
| SHED-013 | Search — case insensitive | ✅ | Type "tomato" (lowercase) → Tomato card still found | Plants | — | ✅ Passing |
| SHED-014 | Search — partial match | ✅ | Type "Bos" → "Boston Fern" card found | Plants | — | ✅ Passing |

### Add Plants

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SHED-015 | Add button opens BulkSearchModal | ✅ | Click Add → modal with search input appears | Plants | — | ✅ Passing |
| SHED-016 | Add modal — close without saving | ✅ | Open modal, click close → modal gone, plant count unchanged | Plants | — | ✅ Passing |
| SHED-017 | Manual plant — happy path | ✅ | Switch to manual tab, enter name "E2E Test Plant", save → new card in grid | Plants | — | ✅ Passing |
| SHED-018 | Manual plant — empty name | ❌ | Submit manual form with blank name → validation error, form stays open | Plants | — | ✅ Passing |
| SHED-019 | Manual plant — duplicate name | ❌ | Enter an already-existing plant name → duplicate warning or error shown | Plants | — | ✅ Passing |
| SHED-020 | API search — shows results | ✅ | Type plant name in Perenual search → results list populates | Plants | Perenual API mock | ✅ Passing |
| SHED-021 | API search — no results | ❌ | Search for nonsense term → no results shown (empty list) | Plants | Perenual API mock | ✅ Passing |
| SHED-022a | AI tab — search result appears | ✅ | Switch to AI tab, type plant name → mocked AI matches listed | Plants | `plant-doctor` mock | ✅ Passing |

### Plant Card Actions

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SHED-022 | Card click opens PlantEditModal | ✅ | Click Tomato card → edit modal opens showing "Tomato" name | Plants | — | ✅ Passing |
| SHED-023 | PlantEditModal — close | ✅ | Click Close in modal → modal gone, no changes | Plants | — | ✅ Passing |
| SHED-024 | Archive plant — happy path | ✅ | Click archive icon on Tomato, confirm → Tomato removed from Active, appears in Archived | Plants | — | ✅ Passing |
| SHED-025 | Archive plant — cancel | ✅ | Click archive icon, Cancel → Tomato still in Active | Plants | — | ✅ Passing |
| SHED-026 | Restore archived plant | ✅ | In Archived tab, click restore on Mint → Mint appears in Active | Plants | — | ✅ Passing |
| SHED-027 | Delete plant — happy path | ✅ | Click delete on a test plant, confirm → plant removed, success toast | Plants | — | ✅ Passing |
| SHED-028 | Delete plant — cancel | ✅ | Click delete, Cancel → plant remains | Plants | — | ✅ Passing |
| SHED-029 | Delete plant — with inventory items | ❌ | Delete plant with linked inventory items → confirm dialog warns about cascade | Plants | — | ✅ Passing |
| SHED-030 | Assign plant opens modal | ✅ | Click assign (MapPin) on Tomato → PlantAssignmentModal visible | Plants + Locations | — | ✅ Passing |
| SHED-031 | Assign plant — select location + area | ✅ | In modal, pick "Outside Garden" → "Raised Bed A" → Save → Tomato shows as Planted | Plants + Locations | — | ✅ Passing |
| SHED-032 | Assign plant — cancel | ✅ | Open modal, click cancel → Tomato status unchanged | Plants + Locations | — | ✅ Passing |
| SHED-033 | Assign plant — no locations | ❌ | No locations mocked → location dropdown has only placeholder option | Plants only | Supabase route | ✅ Passing |

---

## Section 06 — Task Management (/schedule — BlueprintManager)

**Spec file:** `tests/e2e/specs/tasks.spec.ts` · `tests/e2e/specs/schedule.spec.ts`
**Page Object:** `tests/e2e/pages/SchedulePage.ts`
**Seed required:** `03_tasks_blueprints.sql`

### Navigation & Basic Render

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SCH-001 | Automations heading renders | ✅ | `/schedule` → "Automations" heading visible | Blueprints | — | ✅ Passing |
| SCH-002 | Nav link navigates | ✅ | Click "Task Management" → URL `/schedule` | Blueprints | — | ✅ Passing |
| SCH-003 | Blueprint cards render | ✅ | Seeded blueprints appear as cards | Blueprints | — | ✅ Passing |
| SCH-004 | Blueprint shows task type | ✅ | Blueprint card shows task type badge (Watering, Pruning, etc.) | Blueprints | — | ✅ Passing |
| SCH-005 | Blueprint shows frequency | ✅ | Blueprint card shows frequency (e.g. "Every 7 days") | Blueprints | — | ✅ Passing |
| SCH-006 | Empty state — no blueprints | ✅ | Clean account (no blueprints) → "No Automations Running" + CTA button | None | — | ✅ Passing |

### Create Blueprint

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SCH-007 | New Automation opens modal | ✅ | Click New Automation → modal with title input appears | Any | — | ✅ Passing |
| SCH-008 | Create — happy path | ✅ | Fill title "E2E Watering", set Watering type, set 7 days, save → card appears | Any | — | ✅ Passing |
| SCH-009 | Create — empty title | ❌ | Submit with blank title → error shown, modal stays open | Any | — | ✅ Passing |
| SCH-010 | Create — all task types available | ✅ | Task type dropdown contains: Watering, Pruning, Harvesting, Fertilizing, Inspection, Pest Control, Maintenance, Planting | Any | — | ✅ Passing |
| SCH-011 | Create — with inventory item link | ✅ | Assign blueprint to "Basil" (INV_BASIL) → blueprint card shows plant link | Plants + Blueprints | — | ✅ Passing |
| SCH-012 | Create — with location | ✅ | Assign blueprint to "Outside Garden" → blueprint shows location | Locations + Blueprints | — | ✅ Passing |
| SCH-013 | Create — with seasonal dates | ✅ | Set start_date and end_date → blueprint shows date range | Any | — | ✅ Passing |
| SCH-014 | Modal cancel | ✅ | Open modal, press Escape or Cancel → modal hidden, no blueprint added | Any | — | ✅ Passing |

### Edit Blueprint

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SCH-015 | Click card opens edit modal pre-filled | ✅ | Click Weekly Watering blueprint → modal opens with title "Weekly Watering" pre-filled | Blueprints | — | ✅ Passing |
| SCH-016 | Edit — change title | ✅ | Edit title, save → card shows updated title | Blueprints | — | ✅ Passing |
| SCH-017 | Edit — change frequency | ✅ | Change from 7 to 14 days, save → card shows new frequency | Blueprints | — | ✅ Passing |
| SCH-018 | Edit — change task type | ✅ | Change type from Watering to Fertilizing, save → badge updates | Blueprints | — | ✅ Passing |

### Delete Blueprint

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SCH-019 | Delete — confirm | ✅ | Click trash on blueprint, confirm → blueprint removed, success toast | Blueprints | — | ✅ Passing |
| SCH-020 | Delete — cancel | ✅ | Click trash, Cancel → blueprint still in list | Blueprints | — | ✅ Passing |
| SCH-021 | Delete — removes linked tasks | ✅ | Deleting blueprint removes linked materialized tasks (cascade) | Blueprints + Tasks | — | ✅ Passing |

### Search & Filter

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SCH-022 | Search — matching | ✅ | Type "Watering" → only Watering blueprints shown | Blueprints | — | ✅ Passing |
| SCH-023 | Search — no match | ❌ | Type "xyzqwerty" → "No matches found" shown | Blueprints | — | ✅ Passing |
| SCH-024 | Filter panel opens | ✅ | Click Filters → filter drawer visible | Blueprints | — | ✅ Passing |
| SCH-025 | Filter by task type — Watering | ✅ | Select Watering → only Watering blueprints shown | Blueprints | — | ✅ Passing |
| SCH-026 | Filter by task type — Pruning | ✅ | Select Pruning → only Pruning blueprints shown | Blueprints | — | ✅ Passing |
| SCH-027 | Filter by task type — Pest Control | ✅ | Select Pest Control → ailment blueprint shown | Blueprints | — | ✅ Passing |
| SCH-028 | Clear all filters | ✅ | With filters active, click "Clear All" → all blueprints reappear | Blueprints | — | ✅ Passing |

---

## Section 07 — Task Lifecycle (Task List)

**Spec file:** `tests/e2e/specs/tasks.spec.ts` (extend)
**Page Object:** `tests/e2e/pages/TaskListPage.ts`
**Seed required:** `03_tasks_blueprints.sql`

### Task Display

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| TASK-001 | Pending task appears | ✅ | Today's pending task visible in Pending tab | Tasks | — | ✅ Passing |
| TASK-002 | Task shows type badge — Watering | ✅ | Watering task shows blue "Watering" badge | Tasks | — | ✅ Passing |
| TASK-003 | Task shows type badge — Pruning | ✅ | Pruning task shows correct badge colour | Tasks | — | ✅ Passing |
| TASK-004 | Task shows type badge — Harvesting | ✅ | Harvesting task shows correct badge | Tasks | — | ✅ Passing |
| TASK-005 | Task shows type badge — Fertilizing | ✅ | Fertilizing task badge visible | Tasks | — | ✅ Passing |
| TASK-006 | Task shows type badge — Inspection | ✅ | Inspection task badge visible | Tasks | — | ✅ Passing |
| TASK-007 | Task shows type badge — Pest Control | ✅ | Pest Control task badge visible | Tasks | — | ✅ Passing |
| TASK-008 | Task shows type badge — Maintenance | ✅ | Maintenance task badge visible | Tasks | — | ✅ Passing |
| TASK-009 | Task shows type badge — Planting | ✅ | Planting task badge visible | Tasks | — | ✅ Passing |
| TASK-010 | Overdue task — displayed | ✅ | Overdue pending task (due -7 days) visible in task list | Tasks | — | ✅ Passing |
| TASK-011 | Overdue task — visual indicator | ✅ | Overdue task has red/warning indicator | Tasks | — | ✅ Passing |
| TASK-012 | Future task — appears in list | ✅ | Future task (due +3 days) visible in window | Tasks | — | ✅ Passing |
| TASK-013 | Ghost task — appears for blueprint | ✅ | Recurring blueprint without physical task → ghost task appears on correct date; anchored to "Daily Garden Check" (freq=1) blueprint for timezone resilience | Blueprints | — | ✅ Passing |
| TASK-014 | Skipped task — not in Pending tab | ✅ | Skipped task absent from Pending tab | Tasks | — | ✅ Passing |
| TASK-015 | Completed task in Completed tab | ✅ | Completed task visible in Completed tab (conditional: seeded due_date is UTC; may not appear in UTC+N timezone near midnight — TASK-016 covers the tab robustly) | Tasks | — | ✅ Passing |

### Task Actions

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| TASK-016 | Mark task complete | ✅ | Click complete on pending task → task moves to Completed tab | Tasks | — | ✅ Passing |
| TASK-017 | Mark complete — ghost task | ✅ | Mark ghost task as complete → physical task created, ghost gone | Blueprints | — | ✅ Passing |
| TASK-018 | Postpone (skip) task | ✅ | Click postpone on a task → task status becomes Skipped, disappears from Pending | Tasks | — | ✅ Passing |
| TASK-019 | Postpone — tombstone suppresses ghost | ✅ | Skipped task → ghost not regenerated for same blueprint+date | Blueprints | — | ✅ Passing |
| TASK-020 | Auto-watering skip — rain forecast | ✅ | Watering task on rain-forecast day → auto-skip badge or indicator visible | Tasks + Weather | — | ✅ Passing |
| TASK-021 | Delete task | ✅ | Click delete on task, confirm → task removed | Tasks | — | ✅ Passing |
| TASK-022 | Delete task — cancel | ✅ | Click delete, Cancel → task remains | Tasks | — | ✅ Passing |
| TASK-023 | Task with plant link | ✅ | Task linked to INV_BASIL shows "Basil" plant reference | Tasks + Plants | — | ✅ Passing |
| TASK-024 | Task with location | ✅ | Task with location shows location name badge | Tasks + Locations | — | ✅ Passing |
| TASK-025 | Postpone ghost task — shift blueprint | ✅ | Postpone ghost task with "shift all future tasks" toggle → blueprint start_date updated, tombstone created, future ghosts move by same offset | Blueprints | — | ✅ Passing |

---

## Section 08 — Plant Doctor (/doctor)

**Spec file:** `tests/e2e/specs/plant-doctor.spec.ts`
**Page Object:** `tests/e2e/pages/PlantDoctorPage.ts`
**Seed required:** `00_bootstrap.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| DOC-001 | Heading renders | ✅ | `/doctor` → "Plant Doctor" heading visible | Bootstrap | — | ✅ Passing |
| DOC-002 | Upload dropzone visible | ✅ | Dropzone rendered before upload | Bootstrap | — | ✅ Passing |
| DOC-003 | Identify/Diagnose hidden before upload | ✅ | Action buttons not visible before image uploaded | Bootstrap | — | ✅ Passing |
| DOC-004 | Upload image — buttons appear | ✅ | Upload image → Identify and Diagnose buttons become visible | Bootstrap | — | ✅ Passing |
| DOC-005 | Identify — mocked response | ✅ | Mock `plant-doctor` → click Identify → AI result text shown | Bootstrap | `plant-doctor` identify | ✅ Passing |
| DOC-006 | Diagnose — mocked response | ✅ | Mock `plant-doctor` → click Diagnose → diagnosis text shown ("early blight") | Bootstrap | `plant-doctor` diagnose | ✅ Passing |
| DOC-007 | Clear image button | ✅ | After upload, click clear → dropzone returns, buttons hidden | Bootstrap | — | ✅ Passing |
| DOC-008 | Save to Journal toggle | ✅ | After result, "Save to Journal" toggle visible and interactive | Bootstrap | `plant-doctor` identify | ✅ Passing |
| DOC-009 | AI disabled — buttons disabled | ✅ | Mock profile `ai_enabled=false` → Identify/Diagnose buttons disabled | Bootstrap (no AI) | Supabase profile mock | ✅ Passing |
| DOC-010 | Edge function error | ❌ | Mock `plant-doctor` to return 500 → error message/toast shown | Bootstrap | `plant-doctor` 500 | ✅ Passing |
| DOC-011 | Nav link navigates | ✅ | Click "Plant Doctor" nav link → URL `/doctor` | Bootstrap | — | ✅ Passing |
| DOC-012 | PlantDoctorChat FAB — globally visible | ✅ | On `/dashboard` → chat floating button visible | Bootstrap | — | ✅ Passing |
| DOC-013 | Upload invalid file type | ❌ | Upload a `.txt` file → error message shown, buttons remain hidden | Bootstrap | — | ✅ Passing |

---

## Section 09 — Planner (/planner)

**Spec file:** `tests/e2e/specs/planner.spec.ts`
**Page Object:** `tests/e2e/pages/PlannerPage.ts`
**Seed required:** `05_planner.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| PLAN-001 | Planner heading renders | ✅ | `/planner` → heading visible | Plans | — | ✅ Passing |
| PLAN-002 | New Plan button visible | ✅ | "New Plan" button rendered | Plans | — | ✅ Passing |
| PLAN-003 | Three status tabs | ✅ | Pending, Completed, Archived tabs visible | Plans | — | ✅ Passing |
| PLAN-004 | Nav link navigates | ✅ | Click "Planner" nav link → URL `/planner` | Plans | — | ✅ Passing |
| PLAN-005 | Pending plans list | ✅ | "Summer Veg Plan" (In Progress) appears in Pending tab | Plans | — | ✅ Passing |
| PLAN-006 | Empty state — no plans | ✅ | Pending tab: "No Pending Plans" shown for clean account | None | — | ✅ Passing |
| PLAN-007 | Completed tab — shows completed | ✅ | Click Completed → "Spring Cleanup" visible | Plans | — | ✅ Passing |
| PLAN-008 | Archived tab — shows archived | ✅ | Click Archived → "Winter Prep" visible | Plans | — | ✅ Passing |
| PLAN-009 | New Plan — opens modal | ✅ | Click New Plan → modal with name input | Plans | — | ✅ Passing |
| PLAN-010 | New Plan — close modal | ✅ | Open modal, click close → modal gone | Plans | — | ✅ Passing |
| PLAN-011 | New Plan — blank name | ❌ | Submit with blank name → validation error | Plans | — | ✅ Passing |
| PLAN-012 | New Plan — AI generation (mocked) | ✅ | Fill name, click Generate → "Project Generated Successfully!" toast | Plans | `generate-landscape-plan` mock | ✅ Passing |
| PLAN-013 | New Plan — AI error | ❌ | Mock `generate-landscape-plan` returns 500 → error toast shown | Plans | `generate-landscape-plan` 500 | ✅ Passing |
| PLAN-014 | Plan card — three-dot menu | ✅ | Click MoreVertical on "Summer Veg Plan" → menu with Archive/Delete | Plans | — | ✅ Passing |
| PLAN-015 | Archive plan — happy path | ✅ | Archive "Summer Veg Plan" → moves to Archived tab | Plans | — | ✅ Passing |
| PLAN-016 | Archive plan — cancel | ✅ | Click Archive, Cancel → plan remains in Pending | Plans | — | ✅ Passing |
| PLAN-017 | Delete plan — happy path | ✅ | Delete plan, confirm → removed, success toast | Plans | — | ✅ Passing |
| PLAN-018 | Delete plan — cancel | ✅ | Click Delete, Cancel → plan remains | Plans | — | ✅ Passing |
| PLAN-019 | Unarchive plan | ✅ | Archived tab → Restore on "Winter Prep" → returns to Pending | Plans | — | ✅ Passing |
| PLAN-020 | Click plan card → staging view | ✅ | Click "Summer Veg Plan" → PlanStaging renders with plan title | Plans | — | ✅ Passing |
| PLAN-021 | Back from staging | ✅ | Click back in staging → plan list shown | Plans | — | ✅ Passing |

---

## Section 10 — Ailment Watchlist (/watchlist)

**Spec file:** `tests/e2e/specs/watchlist.spec.ts`
**Page Object:** `tests/e2e/pages/WatchlistPage.ts`
**Seed required:** `06_ailments_watchlist.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| WL-001 | Watchlist heading renders | ✅ | `/watchlist` → heading visible | Ailments | — | ✅ Passing |
| WL-002 | Ailment cards render | ✅ | Aphid, Early Blight, Japanese Knotweed cards visible | Ailments | — | ✅ Passing |
| WL-003 | Empty state — no ailments | ✅ | Clean account → empty state prompt visible | None | Supabase mock | ✅ Passing |
| WL-004 | Type badge — pest | ✅ | Aphid card shows "Pest" badge | Ailments | — | ✅ Passing |
| WL-005 | Type badge — disease | ✅ | Early Blight shows "Disease" badge | Ailments | — | ✅ Passing |
| WL-006 | Type badge — invasive_plant | ✅ | Japanese Knotweed shows "Invasive Plant" badge | Ailments | — | ✅ Passing |
| WL-007 | Archived ailment not in active list | ✅ | Powdery Mildew (archived) not shown in default view | Ailments | — | ✅ Passing |
| WL-008 | Add button opens modal | ✅ | Click Add → "Add to Watchlist" modal appears | Any | — | ✅ Passing |
| WL-009 | Add modal — manual fields | ✅ | Select Manual mode → name, description, type, affected plants fields visible | Any | — | ✅ Passing |
| WL-010 | Add ailment — blank name | ❌ | Submit without name → "Name is required" error | Any | — | ✅ Passing |
| WL-011 | Add ailment — manual happy path | ✅ | Fill name "E2E Aphid Test", type Pest, save → card appears, toast shown | Any | — | ✅ Passing |
| WL-012 | Add ailment — AI mode (mocked) | ✅ | Switch to AI, type pest name, search → mocked result appears | Any | `watchlist-search` mock | ✅ Passing |
| WL-013 | Add ailment — AI error | ❌ | Mock AI search 500 → error message shown | Any | `watchlist-search` 500 | ✅ Passing |
| WL-014 | Card click opens detail modal | ✅ | Click Aphid → AilmentDetailModal with name, type, tabs | Ailments | — | ✅ Passing |
| WL-015 | Detail modal — Info tab | ✅ | Info tab shows description and affected plants | Ailments | — | ✅ Passing |
| WL-016 | Detail modal — Prevention tab | ✅ | Click Prevention → prevention steps shown | Ailments | — | ✅ Passing |
| WL-017 | Detail modal — Remedy tab | ✅ | Click Remedy → remedy steps shown | Ailments | — | ✅ Passing |
| WL-018 | Detail modal — close | ✅ | Click X → modal closes | Ailments | — | ✅ Passing |
| WL-019 | Delete from detail modal — confirm | ✅ | Open detail, trash, confirm → ailment removed from list | Ailments | — | ✅ Passing |
| WL-020 | Delete from detail modal — cancel | ✅ | Cancel → ailment remains | Ailments | — | ✅ Passing |
| WL-021 | Archive ailment | ✅ | Archive on active ailment → moves out of active list | Ailments | — | ✅ Passing |
| WL-022 | Search — filters by name | ✅ | Type "Aphid" → only Aphid card shown | Ailments | — | ✅ Passing |
| WL-023 | Search — no match | ❌ | Type "xyzqwerty" → no cards shown | Ailments | — | ✅ Passing |
| WL-024 | Filter by type — pest | ✅ | Filter to Pest → only Aphid shown | Ailments | — | ✅ Passing |
| WL-025 | Filter by type — disease | ✅ | Filter to Disease → only Blight shown | Ailments | — | ✅ Passing |

---

## Section 11 — Garden Profile (/profile)

**Spec file:** `tests/e2e/specs/garden-profile.spec.ts`
**Page Object:** `tests/e2e/pages/GardenProfilePage.ts`
**Seed required:** `08_profile_preferences.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| PROF-001 | Profile heading renders | ✅ | `/profile` → heading visible | Bootstrap | — | ✅ Passing |
| PROF-002 | Nav link navigates | ✅ | Click "Garden Profile" nav link → URL `/profile` | Bootstrap | — | ✅ Passing |
| PROF-003 | Quiz shows — no completion | ✅ | Account without quiz completion → progress bar + Q1 visible | Bootstrap | — | ✅ Passing |
| PROF-004 | Quiz option click enables Next | ✅ | Click an answer option → Next button enabled | Bootstrap | — | ✅ Passing |
| PROF-005 | Quiz Next advances to Q2 | ✅ | Click Next on Q1 → Q2 rendered | Bootstrap | — | ✅ Passing |
| PROF-006 | Quiz Back returns to Q1 | ✅ | On Q2, click Back → Q1 shown | Bootstrap | — | ✅ Passing |
| PROF-007 | Progress bar increments | ✅ | Advancing quiz → progress bar aria-valuenow increases | Bootstrap | — | ✅ Passing |
| PROF-008 | Quiz completion — heading shown | ✅ | Account with quiz done → completion heading visible | Profile (08) | — | ✅ Passing |
| PROF-009 | Reset quiz button visible | ✅ | Completed account → Reset button visible | Profile (08) | — | ✅ Passing |
| PROF-010 | Reset quiz | ✅ | Click Reset → Q1 progress visible again | Profile (08) | — | ✅ Passing |
| PROF-011 | Swipe tab visible | ✅ | Swipe tab rendered alongside Quiz tab | Bootstrap | — | ✅ Passing |
| PROF-012 | Swipe tab click | ✅ | Click Swipe tab → swipe deck or loading state appears | Bootstrap | Perenual mock | ✅ Passing |
| PROF-013 | Preferences section | ✅ | Account with preferences → preferences accordion/list visible | Profile (08) | — | ✅ Passing |
| PROF-014 | Preferences — empty | ✅ | No preferences → "No preferences yet" message | Bootstrap | — | ✅ Passing |
| PROF-015 | Delete preference | ✅ | Click delete on preference → preference removed | Profile (08) | — | ✅ Passing |

---

## Section 12 — Location Management (/management)

**Spec file:** `tests/e2e/specs/area-setup.spec.ts`
**Page Object:** `tests/e2e/pages/LocationManagementPage.ts`
**Seed required:** `01_locations_areas.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| MGMT-001 | Heading renders | ✅ | `/management` → "Location Management" heading visible | Locations | — | ✅ Passing |
| MGMT-002 | New Location button visible | ✅ | "New Location" button rendered | Locations | — | ✅ Passing |
| MGMT-003 | Nav link navigates | ✅ | Click "Location Management" nav link → URL `/management` | Locations | — | ✅ Passing |
| MGMT-004 | Existing locations shown | ✅ | "Outside Garden" and "Indoor Space" location cards visible | Locations | — | ✅ Passing |
| MGMT-005 | New Location form opens | ✅ | Click New Location → form with name input visible | Locations | — | ✅ Passing |
| MGMT-006 | Form has name input | ✅ | Name text input present in create form | Locations | — | ✅ Passing |
| MGMT-007 | Form cancel hides it | ✅ | Click Cancel → form hidden, New Location button back | Locations | — | ✅ Passing |
| MGMT-008 | Create location — happy path | ✅ | Enter name, save → form closes, new location card appears | Locations | — | ✅ Passing |
| MGMT-009 | Create location — empty name | ❌ | Submit with blank name → error toast, form stays open | Locations | — | ✅ Passing |
| MGMT-010 | Indoor/Outdoor toggle in form | ✅ | Create form has Indoor/Outdoor checkbox | Locations | — | ✅ Passing |
| MGMT-011 | Create indoor location | ✅ | Create location with Indoor toggle → appears with indoor indicator | Locations | — | ✅ Passing |
| MGMT-012 | Add area — happy path | ✅ | Expand location, click Add Area, fill name, save → area appears nested | Locations | — | ✅ Passing |
| MGMT-013 | Add area — empty name | ❌ | Submit with blank area name → validation error | Locations | — | ✅ Passing |
| MGMT-014 | Delete area — confirm | ✅ | Click trash on area, confirm → area removed from location | Locations | — | ✅ Passing |
| MGMT-015 | Delete area — cancel | ✅ | Click trash on area, Cancel → area remains | Locations | — | ✅ Passing |
| MGMT-016 | Delete location — confirm | ✅ | Click trash on location (no plants), confirm → location removed | Locations | — | ✅ Passing |
| MGMT-017 | Delete location — cancel | ✅ | Click trash on location, Cancel → location remains | Locations | — | ✅ Passing |
| MGMT-018 | Delete location — has inventory | ❌ | Delete location with planted items → warning or cascade confirmation shown | Locations + Plants | — | ✅ Passing |
| MGMT-019 | Advanced area settings opens | ✅ | Click gear icon on area → pH, growing medium, lux fields visible | Locations | — | ✅ Passing |
| MGMT-020 | Save advanced settings | ✅ | Set pH to 6.5, save → success toast, panel closes | Locations | — | ✅ Passing |
| MGMT-021 | pH validation — out of range | ❌ | Enter pH = 15 → validation error (range 0–14) | Locations | — | ✅ Passing |

---

## Section 13 — Guides (/guides)

**Spec file:** `tests/e2e/specs/guides.spec.ts`
**Page Object:** `tests/e2e/pages/GuidesPage.ts`
**Seed required:** `07_guides.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| GDE-001 | Guides heading renders | ✅ | `/guides` → "Guides" heading visible | Guides | — | ✅ Passing |
| GDE-002 | Guide cards render | ✅ | Watering Basics, Pruning Techniques, Composting 101 cards visible | Guides | — | ✅ Passing |
| GDE-003 | Empty state — no guides | ✅ | No guides in DB → graceful empty/loading state | None | Supabase mock | ✅ Passing |
| GDE-004 | Nav link navigates | ✅ | Click "Guides" nav link → URL `/guides` | Guides | — | ✅ Passing |
| GDE-005 | Search — matching | ✅ | Type "Watering" → only Watering Basics shown | Guides | — | ✅ Passing |
| GDE-006 | Search — no match | ❌ | Type "xyzqwerty" → "No guides found" shown | Guides | — | ✅ Passing |
| GDE-007 | Label filter dropdown opens | ✅ | Click label filter → dropdown with label options visible | Guides | — | ✅ Passing |
| GDE-008 | Filter by label | ✅ | Select "Beginner" → only Beginner guides shown | Guides | — | ✅ Passing |
| GDE-009 | Clear label filter | ✅ | After filtering, select "All" → all guides shown | Guides | — | ✅ Passing |
| GDE-010 | Guide card click — reading view | ✅ | Click Watering Basics → reading view with title, difficulty, minutes | Guides | — | ✅ Passing |
| GDE-011 | Reading view — sections render | ✅ | At least one paragraph/section rendered in reading view | Guides | — | ✅ Passing |
| GDE-012 | Back to Library | ✅ | In reading view, click back → guide list shown | Guides | — | ✅ Passing |
| GDE-013 | Guide detail — sections render | ✅ | Click guide card → detail view body text contains "watering" | Guides | — | ✅ Passing |
| GDE-014 | Tag filter dropdown opens | ✅ | Click tag filter button → "All" option visible in dropdown | Guides | — | ✅ Passing |
| GDE-018 | Fetch error state | ❌ | Mock Supabase `/rest/v1/guides` → 500 → "Failed to load guides" visible | None | Supabase route | ✅ Passing |
| GDE-019 | Retry on error | ✅ | Error state → click "Try Again" → guides reload from real DB | None | Supabase route | ✅ Passing |

---

## Section 14 — Plant Visualiser (/visualiser)

**Spec file:** `tests/e2e/specs/visualiser.spec.ts`
**Page Object:** `tests/e2e/pages/VisualiserPage.ts`
**Seed required:** `02_plants_shed.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| VIS-001 | Heading renders | ✅ | `/visualiser` → "Plant Visualiser" heading visible | Plants | — | ✅ Passing |
| VIS-002 | Plant list renders | ✅ | Seeded plants appear as selectable cards | Plants | — | ✅ Passing |
| VIS-003 | Empty state — no plants | ✅ | Clean account → empty state or "Add plants" prompt | None | — | ✅ Passing |
| VIS-004 | Plant selection toggle | ✅ | Click Tomato card → selection indicator appears | Plants | — | ✅ Passing |
| VIS-005 | Deselect plant | ✅ | Click selected Tomato again → indicator removed | Plants | — | ✅ Passing |
| VIS-006 | Search filters list | ✅ | Type "Basil" → only Basil shown | Plants | — | ✅ Passing |
| VIS-007 | Source filter | ✅ | Select "Manual" → only manual plants shown | Plants | — | ✅ Passing |
| VIS-008 | Open Visualiser — enabled with selection | ✅ | Select plant → "Open Visualiser" button becomes enabled | Plants | — | ✅ Passing |
| VIS-009 | Open Visualiser — disabled with no selection | ❌ | No plants selected → button disabled or absent | Plants | — | ✅ Passing |
| VIS-010 | Nav link navigates | ✅ | Nav link → URL `/visualiser` | Plants | — | ✅ Passing |

> **Note:** Camera/AR tests (actual overlay, capture) require headed mode. Flag with `test.skip()` in CI and document as manual test cases.

---

## Section 15 — Light Sensor (/lightsensor)

**Spec file:** `tests/e2e/specs/lightsensor.spec.ts`
**Page Object:** `tests/e2e/pages/LightSensorPage.ts`
**Seed required:** `01_locations_areas.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| LUX-001 | Heading renders | ✅ | `/lightsensor` → heading visible | Locations | — | ✅ Passing |
| LUX-002 | Lux display present | ✅ | Lux reading element (showing 0 or initialising) present | Locations | — | ✅ Passing |
| LUX-003 | Light category labels | ✅ | At least one of Deep Shade/Low Light/Bright Indirect/Partial Sun/Direct Sun visible | Locations | — | ✅ Passing |
| LUX-004 | Start scan button visible | ✅ | Start/Scan button rendered | Locations | — | ✅ Passing |
| LUX-005 | Method toggle available | ✅ | Pixel Analysis option selectable in method toggle | Locations | — | ✅ Passing |
| LUX-006 | Calibration panel opens | ✅ | Click calibrate → calibration controls visible | Locations | — | ✅ Passing |
| LUX-007 | Save disabled — no area selected | ❌ | Save button disabled when no location/area picked | Locations | — | ✅ Passing |
| LUX-008 | Location dropdown populates | ✅ | Location dropdown has "Outside Garden" as option | Locations | — | ✅ Passing |
| LUX-009 | Area dropdown populates | ✅ | After selecting location, area dropdown has "Raised Bed A" | Locations | — | ✅ Passing |
| LUX-010 | Save reading — success | ✅ | Select location + area, click Save → success toast | Locations | — | ✅ Passing |
| LUX-011 | Nav link navigates | ✅ | Nav link → URL `/lightsensor` | Locations | — | ✅ Passing |

> **Note:** Actual pixel-analysis scanning tests require camera permission + headed mode. Flag with `test.skip()` in CI.

---

## Section 16 — Global Layout & Navigation

**Spec file:** `tests/e2e/specs/layout.spec.ts`
**Seed required:** `00_bootstrap.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| NAV-001 | Sidebar collapse | ✅ | Click hamburger/Menu button → nav labels hidden, sidebar narrowed | Bootstrap | — | ✅ Passing |
| NAV-002 | Sidebar expand | ✅ | Click Menu button again → labels reappear | Bootstrap | — | ✅ Passing |
| NAV-008 | HomeDropdown shows seeded home | ✅ | "Test Garden Home" visible as HomeDropdown button label | Bootstrap | — | ✅ Passing |
| NAV-003 | HomeDropdown shows home name | ✅ | Dropdown shows "Test Garden Home" (not "Select Home") | Bootstrap | — | ✅ Passing |
| NAV-004 | HomeDropdown — Create New Home | ✅ | Click dropdown → "Create New Home" button visible | Bootstrap | — | ✅ Passing |
| NAV-005 | Mobile menu opens (375×812 viewport) | ✅ | At mobile size, click floating Menu FAB → nav panel visible | Bootstrap | — | ✅ Passing |
| NAV-006 | Mobile menu link navigates | ✅ | Open mobile menu, click "The Shed" → URL `/shed`, menu closes | Bootstrap | — | ✅ Passing |
| NAV-007 | All nav links from desktop sidebar | ✅ | Click each nav link in sequence → correct URL each time | Bootstrap | — | ✅ Passing |

---

## Appendix A — Mock Payloads to Add

Add these to `tests/e2e/fixtures/api-mocks.ts`:

```typescript
export const MOCK_PLANNER_PLAN = {
  project_overview: "A summer vegetable garden plan.",
  phases: [
    { name: "Preparation", tasks: ["Clear bed", "Amend soil"] },
    { name: "Planting", tasks: ["Plant tomatoes", "Plant basil"] },
  ],
};

export const MOCK_WATCHLIST_AI_RESULT = {
  results: [
    {
      name: "Aphid",
      scientific_name: "Aphidoidea",
      type: "pest",
      description: "Small sap-sucking insects that cluster on young growth.",
      symptoms: ["Sticky residue", "Curled leaves", "Distorted shoots"],
      prevention_steps: ["Encourage ladybirds", "Use reflective mulch"],
      remedy_steps: ["Blast with water", "Apply neem oil"],
      affected_plants: ["Rose", "Tomato", "Pepper"],
    },
  ],
};
```

---

---

## Section 15 — Realtime

Tests that Supabase Realtime subscriptions keep the UI in sync when rows are mutated via the REST API (simulating changes from another device or a server-side edge function).

**File:** `tests/e2e/specs/realtime.spec.ts`

**Requirements:**
- `SUPABASE_SERVICE_ROLE_KEY` env var must be set (local Supabase `supabase status` shows it)
- Tests are self-skipping when the env var is absent

**Seed dependencies:** `01_locations_areas.sql` (Outside Garden, 3 areas), `03_tasks_blueprints.sql` (TASK_PENDING)

| ID | Type | Test | Mechanism | Status |
|---|---|---|---|---|
| RT-001 | ✅ | Delete area via API → dashboard location tile area count decrements from 3→2 | REST DELETE on `areas`, wait for Realtime `areas` event → `fetchDashboardData()` | 🔲 Planned |
| RT-002 | ✅ | Complete task via API → task disappears from today's pending list | REST PATCH on `tasks`, wait for Realtime `tasks` event → `fetchTasksAndGhostsSilent()` | 🔲 Planned |
| RT-003 | ✅ | New blueprint inserted via API → BlueprintManager shows it | REST POST on `task_blueprints`, wait for Realtime `task_blueprints` event → `fetchBlueprints()` | 🔲 Planned |
| RT-004 | ✅ | Weather snapshot upserted via API → weather tile shows new temperature (99°C) | REST POST on `weather_snapshots`, wait for Realtime `weather_snapshots` event → weather state update | 🔲 Planned |

**Notes:**
- RT-001 uses `data-testid="location-{id}-areas-count"` on the area count span in `LocationTile.tsx`
- RT-002 checks that "Water the Garden (standalone)" (TASK_PENDING, `...0006-000000000001`) disappears from the pending view
- RT-003 inserts a blueprint with a unique title `RT-003 Realtime Test Blueprint` and cleans up after
- RT-004 upserts a snapshot with `temperature_2m: 99` — the 99°C value is unmistakable in the weather tile
- All tests restore the original data after assertion so seed state is preserved for subsequent runs

---

## Section 16 — Yield Recorder & Predictor

**File:** `tests/e2e/specs/yield.spec.ts`  
**Page Object:** `tests/e2e/pages/YieldPage.ts`

**Seed dependencies:**
- `02_plants_shed.sql` — Basil (BAS-001) planted in Raised Bed A (`instance_id: 0000000N-0000-0000-0004-000000000002`)
- `10_yield.sql` — 3 yield records (0.15 kg, 0.20 kg, 0.18 kg) + `expected_harvest_date = 2026-06-01`

**Navigation pattern:** Tests navigate via `/dashboard?locationId=...&areaId=...&instanceId=...` which auto-opens the instance modal via `AreaDetails`'s `instanceId` URL-param effect. UUID prefixes are worker-specific (see § Parallel Worker Accounts).

**AI mock:** Stage 2 tests use `mockEdgeFunction(page, "predict-yield", MOCK_PREDICT_YIELD)` to intercept the Edge Function and return a canned `{ estimated_value: 2.4, unit: "kg", confidence: "medium", reasoning: "...", tips: [...] }` response.

### Stage 1 — Yield Recorder (all users)

| ID | Type | Test | Selector / Assertion | Status |
|---|---|---|---|---|
| YLD-001 | ✅ | Yield tab is visible when opening an instance modal | `data-testid="instance-modal-tab-yield"` | ✅ Passing |
| YLD-002 | ✅ | Unit select contains all expected options (g, kg, lbs, oz, items, bunches) | `option[value="${unit}"]` count = 1 each | ✅ Passing |
| YLD-003 | ✅ | Submitting value=0.5, unit=kg inserts record and shows it in history | `yield-history-list` contains "0.5" | ✅ Passing |
| YLD-004 | ✅ | Second entry appears at top of history (newest first) | first `yield-record-*` contains "2.2" after logging 1.1 then 2.2 | ✅ Passing |
| YLD-005 | ❌ | Submitting empty value shows validation error | `data-testid="yield-value-error"` visible | ✅ Passing |
| YLD-006 | ✅ | Submitting without notes succeeds | history list visible after submit | ✅ Passing |
| YLD-007 | ✅ | Seeded yield records visible on tab open (0.15, 0.20, 0.18 kg) | `getByText("0.15")`, `getByText("0.2")`, `getByText("0.18")` in history | ✅ Passing |
| YLD-008 | ❌ | Deleting a record removes it from history | specific `yield-record-${id}` not visible after `yield-delete-${id}` click | ✅ Passing |
| YLD-009 | ✅ | History shows human-readable date | seeded 2026-04-01 renders as `/April 2026/` | ✅ Passing |
| YLD-010 | ✅ | After logging yield, Plant Journal tab shows yield_logged entry | `instance-modal-tab-journal` → text `/yield/i` visible | ✅ Passing |

### Stage 2 — Yield Predictor (AI users only)

| ID | Type | Test | Selector / Assertion | Status |
|---|---|---|---|---|
| YLD-011 | ✅ | AI-enabled user sees Predict Yield button (not paywall) | `yield-predict-button` visible, `yield-predictor-paywall` not visible | ✅ Passing |
| YLD-012 | ✅ | Expected harvest date input is visible for AI user | `yield-harvest-date-input` visible | ✅ Passing |
| YLD-013 | ✅ | Expected harvest date is pre-populated from seed | `yield-harvest-date-input` value = "2026-06-01" | ✅ Passing |
| YLD-014 | ✅ | Clicking Predict Yield shows loading state | `/Predicting/i` text visible immediately | ✅ Passing |
| YLD-015 | ✅ | Mocked prediction renders estimated value on the card | `yield-prediction-value` text = "2.4" | ✅ Passing |
| YLD-016 | ✅ | Confidence badge reads "Medium confidence" for medium response | `yield-prediction-confidence` contains "Medium confidence" | ✅ Passing |
| YLD-017 | ✅ | Reasoning text from mock is visible on the card | `yield-prediction-reasoning` contains "past harvests" | ✅ Passing |
| YLD-018 | ✅ | Each tip from mock rendered as list item (2 tips) | `yield-prediction-tips li` count = 2 | ✅ Passing |
| YLD-019 | ✅ | Clicking Predict Yield again replaces previous prediction (only 1 card) | `yield-prediction-card` count = 1 after second predict | ✅ Passing |
| YLD-020 | ❌ | Edge Function 500 error shows toast, no prediction card | `/Failed to get yield prediction/i` toast, `yield-prediction-card` not visible | ✅ Passing |

---

## Section 17 — Light Tab

**Spec file:** `tests/e2e/specs/lighttab.spec.ts`  
**Page object:** `tests/e2e/pages/LightTabPage.ts`  
**Seed dependency:** `02_plants_shed.sql` — Basil (plant 1000002) has `sunlight: ["Full sun", "Partial shade"]`; Tomato (plant 1000001) has `sunlight: NULL`

### Stage 1 — Instance modal (LGT-001 – LGT-006)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| LGT-001 | ✅ | Light tab button is visible on instance modal | `instance-modal-tab-light` visible | ✅ Passing |
| LGT-002 | ✅ | Optimal range card shown for Basil (has sunlight data) | `light-tab-optimal-range` visible | ✅ Passing |
| LGT-003 | ✅ | Get Reading button is visible when optimal range is shown | `light-tab-get-reading-button` visible | ✅ Passing |
| LGT-004 | ✅ | Clicking Get Reading opens the sensor overlay | `plant-light-reader-back` + "Light Reading" text visible | ✅ Passing |
| LGT-005 | ✅ | Sensor overlay contains a lux display element | `plant-light-reader-lux` visible | ✅ Passing |
| LGT-006 | ✅ | Back button closes the sensor overlay | `plant-light-reader-back` not visible; `light-tab-get-reading-button` reappears | ✅ Passing |

### Stage 2 — TheShed plant modal (LGT-007 – LGT-008)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| LGT-007 | ✅ | Light tab visible on plant modal opened from TheShed | `plant-modal-tab-light` visible | ✅ Passing |
| LGT-008 | ✅ | No-data card shown for plant with null sunlight in DB | `light-tab-no-data` visible | ✅ Passing |

---

## Appendix B — Page Objects

All Page Objects are implemented. Current files in `tests/e2e/pages/`:

| File | Route |
|---|---|
| `AuthPage.ts` | `/` (auth page) |
| `DashboardPage.ts` | `/dashboard` |
| `ShedPage.ts` | `/shed` |
| `TaskListPage.ts` | `/dashboard` (task panel) |
| `PlantDoctorPage.ts` | `/doctor` |
| `PlannerPage.ts` | `/planner` |
| `LocationManagementPage.ts` | `/management` |
| `GardenProfilePage.ts` | `/profile` |
| `GuidesPage.ts` | `/guides` |
| `WatchlistPage.ts` | `/watchlist` |
| `SchedulePage.ts` | `/schedule` |
| `LightSensorPage.ts` | `/lightsensor` |
| `VisualiserPage.ts` | `/visualiser` |
| `YieldPage.ts` | `/dashboard` (instance modal yield tab) |
| `LightTabPage.ts` | `/dashboard` (instance modal light tab) + `/shed` (plant modal light tab) |
