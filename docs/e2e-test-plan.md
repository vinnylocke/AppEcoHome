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

-- Shopping lists
LIST_ACTIVE_ID       = 00000001-0000-0000-0011-000000000001  (Weekly Garden Shop — active)
LIST_COMPLETE_ID     = 00000001-0000-0000-0011-000000000002  (Last Week's Shop — completed)

-- Guides (shared across all workers — not worker-specific)
GUIDE_WATERING_ID    = 00000000-0000-0000-0009-000000000001  (Watering Basics — Beginner)
GUIDE_PRUNING_ID     = 00000000-0000-0000-0009-000000000002  (Pruning Techniques — Intermediate)
GUIDE_COMPOSTING_ID  = 00000000-0000-0000-0009-000000000003  (Composting 101 — Beginner)
```

---

## Seed Script Reference

Seeds are run via the npm script which applies all 10 seed files across all 4 worker accounts:

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
| `12_shopping_lists.sql` | 2 shopping lists (1 active, 1 completed) with 6 items; pre-completes Summer Veg Plan Phase 1 |

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
| AUTH-020 | Sign-up — First Name required | ❌ | Submit sign-up form with blank first name → `#field-error-firstName` visible | None | — | ✅ Passing |
| AUTH-021 | Sign-up — Last Name required | ❌ | Submit sign-up form with blank last name → `#field-error-lastName` visible | None | — | ✅ Passing |
| AUTH-022 | Sign-up — password < 8 chars rejected | ❌ | Fill sign-up with `short` password → "at least 8 characters" error | None | — | ✅ Passing |
| AUTH-023 | Sign-up — valid data fires signup + success banner | ✅ | Mock `**/auth/v1/signup` → submit → POST contains firstName/lastName, banner shows | None | `auth/v1/signup` | ✅ Passing |
| AUTH-030 | Forgot password — empty email blocked | ❌ | Open forgot-password panel → submit blank → inline email error | None | — | ✅ Passing |
| AUTH-031 | Forgot password — valid email confirmation | ✅ | Enter `recover@example.com` → mocked `recover` POST → success panel | None | `auth/v1/recover` | ✅ Passing |
| AUTH-040 | OAuth buttons present | ✅ | Google + Apple buttons visible on sign-in form | None | — | ✅ Passing |
| AUTH-050 | Session persists across reload | ✅ | Authenticated → `page.reload()` → Sign Out still visible | Bootstrap | — | ✅ Passing |

---

## Section 01b — Home Setup Wizard

**Spec files:** `tests/e2e/specs/home-setup-join.spec.ts` · `tests/e2e/specs/home-setup-create.spec.ts`
**Page Object:** `tests/e2e/pages/HomeSetupPage.ts`
**Fixture:** `tests/e2e/fixtures/no-home-yet.ts` — mocks `user_profiles` (home_id null) and `home_members` (empty) so the wizard renders.
**Seed required:** `00_bootstrap.sql` (for auth user only — wizard data is fully mocked)

### Create New Home

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| R1-001 | Create tile routes to create step | ✅ | Click Create New Home tile → form visible, name field auto-focused | Bootstrap | profile reads | ✅ Passing |
| R1-002 | Back arrow returns to selection | ✅ | On create step, click ← → tiles visible again | Bootstrap | profile reads | ✅ Passing |
| R1-003 | Required fields block submit | ❌ | Submit with empty name/postcode → no RPC fires | Bootstrap | RPC capture | ✅ Passing |
| R1-004 | Hemisphere chip flips on country change | ✅ | Select AU → chip reads "Southern" | Bootstrap | profile reads | ✅ Passing |
| R1-005 | Postcode is uppercased before RPC | ✅ | Type `cr3 5ed` → RPC body contains `CR3 5ED` | Bootstrap | `create_new_home` RPC | ✅ Passing |
| R1-006 | Successful create fires sync-weather | ✅ | RPC returns home_id → `sync-weather` invoked with same id | Bootstrap | RPC + `sync-weather` | ✅ Passing |
| R1-007 | RPC failure surfaces banner | ❌ | Mock RPC 500 → form-error banner visible, still on create step | Bootstrap | RPC error | ✅ Passing |
| R1-008 | Submit disabled in flight | ✅ | Delay RPC 500ms → button disabled while loading | Bootstrap | delayed RPC | ✅ Passing |
| R1-009 | sync-weather failure does not block onHomeCreated | ❌ | Mock weather 500 → no error banner | Bootstrap | RPC + weather error | ✅ Passing |

### Join Existing Home (user-flagged gap)

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| R2-001 | Join tile routes to join step | ✅ | Click Join tile → Home ID input visible | Bootstrap | profile reads | ✅ Passing |
| R2-002 | Back arrow returns to selection | ✅ | On join step, click ← → tiles visible again | Bootstrap | profile reads | ✅ Passing |
| R2-003 | Empty input blocks submit | ❌ | Click Join Home with empty input → no profile PATCH | Bootstrap | PATCH capture | ✅ Passing |
| R2-004 | Whitespace-only input rejected | ❌ | Fill `   ` → handler short-circuits, no PATCH | Bootstrap | PATCH capture | ✅ Passing |
| R2-005 | Invalid UUID format → generic banner | ❌ | Mock POST `home_members` 400 (22P02) → banner visible | Bootstrap | POST error | ✅ Passing |
| R2-006 | Unknown UUID / no RLS → generic banner | ❌ | Mock POST `home_members` 403 → banner visible (no existence leak) | Bootstrap | POST error | ✅ Passing |
| R2-007 | Already-a-member duplicate → generic banner | ❌ | Mock POST `home_members` 409 (23505) → banner visible | Bootstrap | POST error | ✅ Passing |
| R2-008 | Successful join updates user_profiles.home_id | ✅ | Mock POST 201 → PATCH body contains target home_id | Bootstrap | POST success + PATCH capture | ✅ Passing |
| R2-009 | Whitespace in pasted ID is trimmed | ✅ | Paste `  uuid  ` → PATCH body has trimmed uuid | Bootstrap | POST success + PATCH capture | ✅ Passing |
| R2-010 | sync-weather NOT fired on join | ✅ | After successful join → no `sync-weather` invoke | Bootstrap | track `sync-weather` | ✅ Passing |
| R2-011 | Error clears after retry | ✅ | Failed join → switch mock to 201 → resubmit → no banner | Bootstrap | POST error → success | ✅ Passing |
| R2-012 | Tab order is input → submit | ✅ | Focus input → Tab → submit focused | Bootstrap | — | ✅ Passing |
| R2-013 | Submit disabled in flight | ✅ | Delay POST 400ms → button disabled while loading | Bootstrap | delayed POST | ✅ Passing |
| R2-014 | Input state persists when returning to join step | ✅ | Fill → back → re-pick Join → input still has draft (parent-level state) | Bootstrap | — | ✅ Passing |

---

## Section 01c — Welcome Modal

**Spec file:** `tests/e2e/specs/welcome-modal.spec.ts`
**Page Object:** `tests/e2e/pages/WelcomeModalPage.ts`
**Fixture:** `tests/e2e/fixtures/welcome-modal-ready.ts` — mocks profile with home_id but no welcome_modal status, and empty locations.
**Seed required:** `00_bootstrap.sql` (auth user only — modal trigger data is mocked)

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| R3-001 | Modal mounts when trigger conditions hold | ✅ | After dashboard load, modal visible with 5 dots | Bootstrap | profile + locations | ✅ Passing |
| R3-002 | Step through slides 0 → 4 | ✅ | Next button cycles through all 5 titles; final shows CTA | Bootstrap | profile + locations | ✅ Passing |
| R3-003 | Back disabled on first slide | ✅ | On slide 0, back button has disabled attribute | Bootstrap | profile + locations | ✅ Passing |
| R3-004 | Dot indicators jump to slide | ✅ | Click dot(2) → title is "Tasks that run themselves" | Bootstrap | profile + locations | ✅ Passing |
| R3-005 | Persona slide tracks selection | ✅ | aria-pressed flips between new/experienced cards | Bootstrap | profile + locations | ✅ Passing |
| R3-006 | Skip issues `dismissed` PATCH and closes | ✅ | Click X → PATCH body contains "dismissed" | Bootstrap | PATCH capture | ✅ Passing |
| R3-007 | Start Quiz issues `completed` PATCH + navigates | ✅ | Final slide → CTA → URL becomes `/profile` | Bootstrap | PATCH capture | ✅ Passing |
| R3-008 | Persona is included in PATCH body | ✅ | Pick `experienced` → PATCH body contains it + `welcomed_at` | Bootstrap | PATCH capture | ✅ Passing |
| R3-009 | Focus trap loops within dialog | ✅ | 10× Tab → activeElement still inside `[role=dialog]` | Bootstrap | profile + locations | ✅ Passing |

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
| CAL-011 | To-Do List button visible | ✅ | `data-testid="calendar-add-todo-list"` rendered next to Add Task | Bootstrap | — | ✅ Passing |
| CAL-012 | Add To-Do List modal — create flow | ✅ | Click List → fill date + 2 task rows → submit → both rows appear in tasks linked to one `todo_lists` row | Bootstrap | — | ✅ Passing |
| CAL-013 | My To-Do Lists modal — render | ✅ | `?open=todo-lists` → list renders with status pill; tick a row → derived status flips when all rows Completed | Bootstrap + freshly created list | — | ✅ Passing |
| CAL-014 | TaskModal From-list pill | ✅ | Open a task linked to a list → "From: …" pill visible → click opens Manage modal scrolled to that list | Bootstrap + freshly created list | — | ✅ Passing |

### Section 04b — Calendar harvest-window visualisations (Wave 20+)

**Spec file:** `tests/e2e/specs/calendar-window.spec.ts`
**Page Object:** `tests/e2e/pages/CalendarPage.ts`
**Seed required:** `03_tasks_blueprints.sql` (the three Wave-20 harvest tasks — "Harvest Tomatoes", "Pumpkin Final Harvest", "Strawberry Snooze Test")
**Per-test reset:** `tests/e2e/utils/harvestSeedReset.ts` (UPDATEs the three tasks back to known-good state so mutating tests stay order-independent)

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| CAL-W20-001 | Today's amber harvest highlight (22.0022) | ✅ | While a harvest window is active, today's cell has `data-harvest-window="true"` after deselect | Harvest tasks (03) | — | ✅ Passing |
| CAL-W20-002 | Snoozed task NOT in today's agenda | ✅ | Strawberry (next_check_at=+2d) is hidden from today's agenda; cell may still light from other tasks | Harvest tasks (03) | — | ✅ Passing |
| CAL-W20-003 | Snoozed dot lands on next_check_at day (22.0027) | ✅ | Day at `next_check_at` has ≥1 pending dot (the snoozed Strawberry) | Harvest tasks (03) | — | ✅ Passing |
| CAL-W20-004 | Agenda hides snoozed on today | ✅ | Click today → snoozed Strawberry absent from agenda task list | Harvest tasks (03) | — | ✅ Passing |
| CAL-W20-005 | Agenda reveals snoozed on next_check_at | ✅ | Click next_check_at day → Strawberry visible in that day's agenda | Harvest tasks (03) | — | ✅ Passing |

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
| SHED-020 | Add to Shed — library-first input opens by default | ✅ | Open Add modal → shared `<PlantSearch>` input visible (no provider tabs); typing offers the opt-in "search more databases" CTA | Plants | — | ✅ Passing |
| SHED-021 | Add to Shed — nonsense query, no selectable rows | ❌ | Type nonsense → no result rows, no Review CTA (library + mocked-empty external) | Plants | Perenual API mock (empty) | ✅ Passing |
| SHED-022a | Add to Shed — preview, see full care, then select into cart | ✅ | Type name → "search more databases" → mocked row → info icon previews inline (no select) → "See full care" opens detail modal (care/grow/companions) → close → tap row selects → Review & Add CTA appears | Plants | Perenual API mock | ✅ Passing |
| SHED-022b | Add to Shed — result thumbnails self-resolve | ⬜ | Result rows render `<PlantResultThumb>`: library rows (null stored image) and Perenual `upgrade_access` placeholders resolve a photo by name via `plant-image-search` (count:1), else fall back to the leaf/sparkles icon. Image is decorative + network-dependent; assert the row renders, not the pixels. | Plants | `plant-image-search` mock | ⬜ Planned |
| SHED-022c | Library clone keeps the selected variant's name | ⬜ | With a catalogue that already holds species *S. lycopersicum* under "Beefsteak Tomato", selecting library "Tomato" (same species) → preview/detail shows **"Tomato"**, not "Beefsteak Tomato" (`ensureCataloguePlantFromLibrary` presents the selected library identity, reuses the species `plantId` for gated tabs). | Plants (two same-species library + catalogue rows) | — | ⬜ Planned |

### Plant Card Actions

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SHED-022 | Card click opens PlantEditModal | ✅ | Click Tomato card → edit modal opens showing "Tomato" name | Plants | — | ✅ Passing |
| SHED-023 | PlantEditModal — close | ✅ | Click Close in modal → modal gone, no changes | Plants | — | ✅ Passing |
| SHED-023b | Tile light icon → Light tab | ✅ | Tap the light (sun) icon on a plant tile → edit modal opens on the Light tab (light-tab content visible), not the Sun Tracker | Plants | — | ✅ Passing |
| SHED-023c | Delete plant with instances — choice | ✅ | Delete a plant that has instances (Tomato) → modal offers "Keep the history (End of Life)" vs "Delete everything"; Cancel is non-destructive | Plants | — | ✅ Passing |
| SHED-023d | Bulk delete — keep-history vs delete-everything | ✅ | Select mode → select a plant with instances → Delete → bulk modal offers both choices; Cancel non-destructive | Plants | — | ✅ Passing |
| SHED-023e | Bulk assign — modal opens | ✅ | Select mode → select plants → Assign → BulkAssignModal opens with per-plant quantities + target options; close non-destructive | Plants | — | ✅ Passing |
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

### Shed Discovery (`tests/e2e/specs/shed-discovery.spec.ts`)

Catalogue PR 2 — gaps the existing `shed-crud.spec.ts` didn't cover. Uses the `authenticatedPage` fixture; reuses the seeded test1 home (added `scientific_name` arrays on every seeded plant for the search tests).

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SHED-DSC-001 | Hub tab routing — `/shed?tab=watchlist` | ✅ | URL switches GardenHub to Watchlist; Plants grid hidden | Plants | — | ✅ Passing |
| SHED-DSC-002 | Shed view toggle — Nursery hides plant grid | ✅ | Click `shed-view-nursery` → search bar + plant cards hidden | Plants | — | ✅ Passing |
| SHED-DSC-003 | Scientific-name search matches Tomato | ✅ | Type "Solanum" → only Tomato card visible (seeded `["Solanum lycopersicum"]`) | Plants | — | ✅ Passing |
| SHED-DSC-004 | Sort A-Z is the default and renders alphabetically | ✅ | `sortSelect` value = `alphabetical`; first card text < last card text | Plants | — | ✅ Passing |
| SHED-DSC-005 | Source filter — Plant Database narrows to api-source | ✅ | Lavender (api) visible; Tomato / Basil (manual) hidden | Plants | — | ✅ Passing |
| SHED-DSC-006 | Source filter — All Sources restores | ✅ | Narrow → reset → manual plants reappear | Plants | — | ✅ Passing |
| SHED-DSC-007 | Credit badge popover shows source + licence | ✅ | Click `image-credit-badge` → popover with "Source:"/"Licence:" | Plants | — | ⏭ Skipped (no api image credits in current seed) |

### Plant Edit + Assignment (`tests/e2e/specs/plant-edit-assignment.spec.ts`)

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| PE-001 | Plant edit — empty name surfaces validation | ❌ | Clear `plant-common-name-input` → click save → "Mandatory Field" error visible | Plants | — | ✅ Passing |
| PA-001 | Assignment — quantity stepper clamps min at 1 | ✅ | Decrement at 1 keeps the value at 1 | Plants | — | ✅ Passing |
| PA-002 | Assignment — increment ticks +1 each press | ✅ | Three increments → quantity = 4 | Plants | — | ✅ Passing |
| PA-003 | Assignment — Add to garden CTA advances to Step 2 | ✅ | Skip area picker → Confirm Assignment button visible | Plants | — | ✅ Passing |
| BA-001 | Bulk assign — modal lists per-plant qty inputs | ✅ | Select 2 plants → Bulk Assign → 2 `bulk-assign-qty-*` inputs + confirm visible | Plants | — | ✅ Passing |

### Instance Edit Modal tabs (`tests/e2e/specs/instance-edit-tabs.spec.ts`)

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| IE-001 | Journal tab — add entry persists | ✅ | Open InstanceEditModal → Journal → Save Entry → entry row visible | Plants + Locations | — | ✅ Passing |
| IE-002 | Routine tab — seeded blueprints render as rows | ✅ | Routine tab → at least one `instance-care-routine-row-*` row | Plants + Blueprints | — | ⏭ Skipped (no blueprints linked to seeded Basil) |
| IE-003 | Yield tab — log harvest stores amount | ✅ | Yield tab → log 250 → history list shows record with "250" | Plants | — | ✅ Passing |

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

### Optimise Tab (Section 06c)

**Spec file:** `tests/e2e/specs/schedule-optimise.spec.ts`
**Page Object:** `tests/e2e/pages/SchedulePage.ts` (Optimise locators added in PR 7)
**Seed required:** `03_tasks_blueprints.sql` — adds a Greenhouse fragmentation pair (Cucumber + Pepper Watering BPs, freqs 7 vs 3) so SCH-032 → SCH-039 are deterministic.

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SCH-029 | Tab bar renders both Routines + Suggestions tabs | ✅ | `/schedule` → `tab-blueprints` and `tab-optimise` both visible | Blueprints | — | ✅ Passing |
| SCH-030 | Switch to Optimise tab | ✅ | Click `tab-optimise` → scope toggle + Analyse button visible (disabled without area) | Blueprints | — | ✅ Passing |
| SCH-031 | Analyse with no issues shows "All good!" | ✅ | South Border (only 1 Pruning BP) → `optimise-all-good` empty state | Blueprints | — | ✅ Passing |
| SCH-032 | Analyse on fragmented area produces proposal cards | ✅ | Greenhouse pair → at least one `proposal-card-*` visible | Blueprints + Greenhouse pair | — | ✅ Passing |
| SCH-033 | Toggling include/exclude updates the selected count | ✅ | Uncheck a `proposal-toggle-*` → `optimise-selected-count` decrements | Blueprints + Greenhouse pair | — | ✅ Passing |
| SCH-034 | Apply optimisation shows confirmation, toast, and history row | ✅ | Apply → `confirm-modal-confirm` → "Applied N optimisation" toast → new `session-row-*` | Blueprints + Greenhouse pair | — | ✅ Passing |
| SCH-035 | Undo reverses the most recent session | ✅ | Click `undo-session-*` → "Optimisation reversed" toast | Blueprints + Greenhouse pair | — | ✅ Passing |
| SCH-036 | AI Analyse hidden when ai_enabled is false | ❌ | Mock `user_profiles` GET to return `ai_enabled: false` → `optimise-ai-analyse-btn` not rendered | Blueprints | `user_profiles` GET | ✅ Passing |
| SCH-037 | AI Analyse populates proposals (mocked) | ✅ | Mock `optimise-area-ai` → AI-badged card with mocked id visible | Blueprints | `optimise-area-ai` edge fn | ✅ Passing |
| SCH-038 | Thumbs-up disables feedback buttons | ✅ | Click `proposal-thumbs-up-*` on mocked AI card → button becomes disabled | Blueprints | edge fn + `optimiser_proposal_feedback` | ✅ Passing |
| SCH-039 | Regenerate AI results opens reason modal | ✅ | Click `optimise-regenerate-btn` after AI run → `regenerate-reason-input` visible | Blueprints | `optimise-area-ai` edge fn | ✅ Passing |

### Section 06b — Schedule edge cases + filter cascade + pause UI

**Spec file:** `tests/e2e/specs/schedule-validation.spec.ts`
**Page Object:** `tests/e2e/pages/SchedulePage.ts` (updated to use the `blueprint-new-btn` testid)

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SCH-V-001 | Frequency input has `min="1"` (UI guard against 0) | ❌ | Open New Routine modal → number input has min=1 | Bootstrap | — | ✅ Passing |
| SCH-V-002 | Filter Location → Area cascade — Area ENABLED on real location | ✅ | Pick a real location → area select enabled | Locations + Blueprints | — | ✅ Passing |
| SCH-V-003 | Filter Location → Area cascade — Area DISABLED on "Unassigned (None)" | ✅ | Pick "none" → area disabled | Locations + Blueprints | — | ✅ Passing |
| SCH-V-004 | Pause toggle visible on a seeded blueprint card | ✅ | `[data-testid$="-pause-toggle"]` visible | Blueprints | — | ✅ Passing |
| SCH-V-005 | Pause toggle opens 7d / 14d / 30d options | ✅ | Click → three options render | Blueprints | — | ✅ Passing |

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

### Section 07b — Task Modal — Harvest Window contract (Wave 20+)

**Spec file:** `tests/e2e/specs/harvest-window.spec.ts`
**Page Object:** `tests/e2e/pages/TaskModalPage.ts`
**Seed required:** `03_tasks_blueprints.sql` (three harvest tasks — see Section 04b)
**Per-test reset:** `tests/e2e/utils/harvestSeedReset.ts`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| HRV-001 | In-window task renders 4-button footer + green pill | ✅ | Tomato (window_end=+7d) → 4 harvest actions + open pill visible | Harvest tasks | — | ✅ Passing |
| HRV-002 | "Harvested" transitions footer away from harvest grid | ✅ | After click, the 4 harvest buttons go away (footer flips to standard) | Harvest tasks | — | ✅ Passing |
| HRV-003 | "Not yet" opens 3 / 5 / 7-day popover | ✅ | Click → popover with three day options | Harvest tasks | — | ✅ Passing |
| HRV-004 | "Not yet 3 days" snooze flow completes (modal closes) | ✅ | Wave 22 contract — snoozeFor() calls onClose | Harvest tasks | — | ✅ Passing |
| HRV-005 | Pre-snoozed Strawberry NOT in today's calendar agenda (22.0024) | ✅ | Wave 22 — daily list still shows snoozed tasks; calendar agenda hides them via effective_due_date | Harvest tasks | — | ✅ Passing |
| HRV-006 | "Picked some" enabled for task with linked instance | ✅ | Inverse coverage for the disabled-when-no-instances contract | Harvest tasks | — | ✅ Passing |
| HRV-007 | Window-closed footer + amber pill on Pumpkin | ✅ | window_end=-2d → closed footer (Log yield / Mark missed) + closed pill; in-window buttons hidden | Harvest tasks | — | ✅ Passing |
| HRV-008 | "Mark missed" removes task from Pending | ✅ | status='Skipped' → row leaves Pending list | Harvest tasks | — | ✅ Passing |
| HRV-009 | "Not yet 7 days" smoke (modal closes) | ✅ | Snooze-7 button completes the flow; cap-to-window logic asserted at DB level elsewhere | Harvest tasks | — | ✅ Passing |

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
| DOC-014 | Multi-ID — boxes + weighted mapping | ⬜ | Upload image → `doctor-btn-multi-id` visible (Sage+) → click → mock `plant-doctor` `identify_scene` returns 2 regions → `scene-map-result` shows `scene-map-box-0/1` overlaid + `scene-map-region-0/1` with candidate names + confidence %. Boxes are AI/network-dependent — assert structure, not pixels. | Bootstrap | `plant-doctor` identify_scene | ⬜ Planned |
| DOC-015 | Multi-ID — empty state | ⬜ | Mock `identify_scene` returns `{ regions: [] }` → "No distinct plants found" empty state shown | Bootstrap | `plant-doctor` identify_scene (empty) | ⬜ Planned |
| DOC-016 | Multi-ID — AI disabled | ⬜ | `ai_enabled=false` → `doctor-btn-multi-id` disabled | Bootstrap (no AI) | Supabase profile mock | ⬜ Planned |
| DOC-017 | Multi-ID — select + confirm a plant | ⬜ | In a region, click `scene-map-candidate-0-1` → `scene-map-confirm-0` → `scene-map-confirmed-0` shows the selected candidate's name. The run writes one `scene` session on completion; confirm updates its `results.confirmed[regionIndex]` in place. | Bootstrap | `plant-doctor` identify_scene | ⬜ Planned |
| DOC-020 | History — Group ID entry + drill-down | ⬜ | After a Multi-ID run, History shows a `Group ID` card (`doctor-history-filter-scene` filter exists) with a "N plants — …" summary; expanding shows `doctor-history-scene-plant-{i}` rows, each with the photo cropped to that plant's box + candidates + confirmed mark. | Bootstrap (scene session seed) | — | ⬜ Planned |
| DOC-018 | Multi-ID — info + See full care | ⬜ | Click `scene-map-info-0-0` → info pills/description shown → `scene-map-see-care-0-0` → `PlantDetailModal` opens (care/grow/companions/light) | Bootstrap | `plant-doctor` (identify_scene + resolve) | ⬜ Planned |
| DOC-019 | Multi-ID — check + add to Shed | ⬜ | Click `scene-map-check-0` → `scene-map-add-to-shed` ("Add 1 to Shed") visible → click → confirmed plant inserted into `plants`; toast shown | Bootstrap | `plant-doctor` + resolve/save mocks | ⬜ Planned |

### Section 08b — Garden AI Chat (regression net)

**Spec file:** `tests/e2e/specs/plant-doctor-chat.spec.ts`
**Page Object:** `tests/e2e/pages/PlantDoctorChatPage.ts`
**Mock helper:** `mockEdgeFunction()` in `tests/e2e/fixtures/api-mocks.ts` + `MOCK_PLANT_DOCTOR_AI_*` constants
**Per-test reset:** `tests/e2e/utils/chatSeedReset.ts` (uses `SUPABASE_SECRET_KEY` to bypass RLS — no DELETE policy on `chat_messages`)
**Env requirement:** `SUPABASE_SECRET_KEY` in `.env.test` (local-only service-role)

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| CHAT-001 | FAB opens the chat panel | ✅ | Click `plant-doctor-chat-fab` → panel mounts | Bootstrap (ai_enabled = true) | — | ✅ Passing |
| CHAT-002 | Send text + mocked AI reply renders | ✅ | Mocked `agent-chat` returns `{reply}` → 1 user bubble + 2 assistant bubbles (welcome + reply) | Bootstrap | `agent-chat` | ✅ Passing |
| CHAT-003 | Page reload after send → reply renders exactly once (22.0023) | ✅ | After persist + reload, cold-open fetch shows 1 user + 1 assistant (welcome suppressed). Two would be the pre-22.0023 dup. | Bootstrap | `agent-chat` | ✅ Passing |
| CHAT-006 | Cucumber-not-in-Shed surfaces ToolConfirmCard for `add_plant_to_shed` (22.0023 mandatory rule) | ✅ | Mocked `agent-chat` returns `pendingToolCalls: [{tool: "add_plant_to_shed", ...}]` → inline `tool-confirm-*` + Confirm/Cancel buttons | Bootstrap | `agent-chat` | ✅ Passing |
| CHAT-009 | Page-context chip hidden on dashboard (no plant context) | ✅ | Dashboard sets `pageContext = { page: "dashboard" }` → chip NOT rendered | Bootstrap | — | ✅ Passing |
| CHAT-010 | Cold open loads pre-seeded turns from `chat_messages` | ✅ | Insert 2 turns via service-role → reload → both bubbles render in order | Bootstrap + manual seed | — | ✅ Passing |

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

### Section 09b — Planner archive + restore (additional regression net)

**Spec file:** `tests/e2e/specs/planner-restore.spec.ts`
**Page Object:** `tests/e2e/pages/PlannerPage.ts` (updated `pendingTab` regex from `/Pending/i` → `/Active/i` to match the actual UI label "Active (N)")
**Per-test reset:** inline `resetWinterPrepArchived()` — sets the seeded "Winter Prep" plan back to `status='Archived'`, so PLN-R-003's restore mutation doesn't break sibling tests.

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| PLN-R-001 | Seeded archived plan visible on Archived tab | ✅ | Click Archived → "Winter Prep" card visible | Plans | — | ✅ Passing |
| PLN-R-002 | Archived plan's options menu shows Restore Plan + Delete Plan | ✅ | Open three-dot menu on archived card → both options visible | Plans | — | ✅ Passing |
| PLN-R-003 | Restore Plan moves card from Archived → Active tab | ✅ | Click Restore → confirm → card gone from Archived, visible on Active | Plans | — | ✅ Passing |

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

## Section 11b — Gardener's Profile (/gardener)

**Spec file:** `tests/e2e/specs/gardener-profile.spec.ts` _(not yet written)_
**Seed required:** `00_bootstrap.sql`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| GP-001 | Nav item visible | ✅ | Click username avatar → "Gardener's Profile" item in dropdown | Bootstrap | — | ❌ Pending |
| GP-002 | Navigate to /gardener | ✅ | Click "Gardener's Profile" → URL `/gardener` | Bootstrap | — | ❌ Pending |
| GP-003 | Account tab renders | ✅ | `/gardener` → "Account" tab active, display name input visible | Bootstrap | — | ❌ Pending |
| GP-004 | Display name save | ✅ | Edit display name → Save → toast + nav name updates | Bootstrap | — | ❌ Pending |
| GP-005 | Email change shows confirmation hint | ✅ | Enter new email → Save → "Check your inbox" message shown | Bootstrap | — | ❌ Pending |
| GP-006 | Password mismatch validation | ✅ | New password ≠ confirm password → error toast, no API call | Bootstrap | — | ❌ Pending |
| GP-007 | Achievements tab renders | ✅ | Click "Achievements" tab → achievement grid visible | Bootstrap | — | ❌ Pending |
| GP-008 | Early Adopter always unlocked | ✅ | Achievements tab → "Early Adopter" card is unlocked (full color) | Bootstrap | — | ❌ Pending |
| GP-009 | Locked achievement shows no description | ✅ | Unearned achievement card shows "Keep going to unlock" | Bootstrap | — | ❌ Pending |
| GP-010 | Stats tab renders | ✅ | Click "Stats" tab → metric cards with numeric values | Bootstrap | — | ❌ Pending |

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

### Section 12b — Members & Permissions (owner-only home)

**Spec file:** `tests/e2e/specs/members-permissions.spec.ts`
**Page Object:** `tests/e2e/pages/HomeManagementPage.ts`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| MEM-001 | Members tab shows the owner row with "(you)" suffix | ✅ | `/home-management` → expand seeded home → Members tab → self-row visible | Bootstrap | — | ✅ Passing |
| MEM-002 | Copy join code writes home UUID to clipboard | ✅ | `home-mgmt-copy-{id}` button writes home_id; clipboard read confirms | Bootstrap | — | ✅ Passing |
| MEM-005 | Owner cannot demote self — role select absent on own row | ✅ | `canManage && !isMe` gate hides the select; explicit zero-count assertion | Bootstrap | — | ✅ Passing |
| MEM-006 | Owner's own row has no Remove + no Configure buttons | ✅ | Same gating hides both UserX trash + Settings2 expand on self-row | Bootstrap | — | ✅ Passing |

### Section 12c — DB-level RLS isolation sweep

**Spec file:** `tests/e2e/specs/rls-isolation-db.spec.ts`
**Utility:** `tests/e2e/utils/rlsAssertions.ts` (`signInAs(workerIndex)` returns a PUBLISHABLE-key supabase-js client signed in as `test{n+1}@rhozly.com`)

These tests run without a browser — they import `@supabase/supabase-js` directly and verify the RLS net at the policy level. Complements the UI-level `data-isolation.spec.ts` (the "isolation" Playwright project).

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| RLS-001 | SELECT tasks for another home returns zero rows | ❌ | Worker 1 → `tasks` `eq("home_id", workerHomeId(1))` → 0 rows | All workers seeded | — | ✅ Passing |
| RLS-002 | SELECT plants for another home returns zero rows | ❌ | Same pattern on `plants`. **Caught a critical RLS bypass** — a permissive `Public Access` policy was overriding the home-members RLS. Fixed in migration `20260614000000_drop_plants_public_access_bypass.sql` | All workers seeded | — | ✅ Passing |
| RLS-003 | SELECT chat_messages where user_id != self returns zero rows | ❌ | Per-user RLS — worker 1 can't read worker 2's chat | All workers seeded | — | ✅ Passing |
| RLS-004 | INSERT a task for another home is rejected | ❌ | WITH CHECK denies; `42501` error or empty data | All workers seeded | — | ✅ Passing |
| RLS-005 | UPDATE another home's plant affects zero rows | ❌ | After the bypass fix, RLS hides the row → eq() matches 0 | All workers seeded | — | ✅ Passing |
| RLS-006 | DELETE another home's blueprint affects zero rows | ❌ | Cross-confirm via worker 2's session shows the row still exists | All workers seeded | — | ✅ Passing |

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
| LUX-010 | Save reading — success | ✅ | Select location + area, click Save → success toast (inserts to area_lux_readings + updates denormalized column) | Locations | — | ✅ Passing |
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
| RT-001 | ✅ | Delete area via API → dashboard location tile area count decrements from 3→2 | REST DELETE on `areas`, wait for Realtime `areas` event → `fetchDashboardData()` | ✅ Passing |
| RT-002 | ✅ | Complete task via API → task disappears from today's pending list | REST PATCH on `tasks`, wait for Realtime `tasks` event → `fetchTasksAndGhostsSilent()` | ✅ Passing |
| RT-003 | ✅ | New blueprint inserted via API → BlueprintManager shows it | REST POST on `task_blueprints`, wait for Realtime `task_blueprints` event → `fetchBlueprints()` | ✅ Passing |
| RT-004 | ✅ | Weather snapshot upserted via API → weather tile shows new temperature (99°C) | REST POST on `weather_snapshots`, wait for Realtime `weather_snapshots` event → weather state update | ✅ Passing |

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

## Section 18 — Stats Tab

**Spec file:** `tests/e2e/specs/statstab.spec.ts`  
**Page object:** `tests/e2e/pages/InstanceStatsTabPage.ts`  
**Seed dependency:** `09_stats.sql` — 2 yield records for Basil, 1 completed Pruning task linked to Basil, 1 plant_instance_ailment linking Basil → Aphid

### Stage 1 — Instance modal (STT-001 – STT-007)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| STT-001 | ✅ | Stats tab button is visible on instance modal | `instance-modal-tab-stats` visible | ✅ Passing |
| STT-002 | ✅ | Plant Info section shows a planted date for Basil | `stats-plant-info` visible; text does not contain "Not recorded" | ✅ Passing |
| STT-003 | ✅ | Yield section shows count ≥ 1 (2 seeded records) | `stats-yield-count` ≥ 1 | ✅ Passing |
| STT-004 | ✅ | Pruning section shows count ≥ 1 (1 seeded prune task) | `stats-prune-count` ≥ 1 | ✅ Passing |
| STT-005 | ✅ | Issues section shows at least 1 ailment row (seeded Aphid link) | `stats-issue-item` count ≥ 1 | ✅ Passing |
| STT-006 | ✅ | Task total count element is visible | `stats-task-total` visible | ✅ Passing |
| STT-007 | ✅ | Empty states shown for Tomato (no yield, pruning, or ailments) | `stats-issues-none` visible; `stats-yield-count` and `stats-prune-count` not visible | ✅ Passing |

---

## Section 19 — Area Lux Reading History

**Component:** `AreaLuxReadings.tsx` (rendered inside Area Details modal → Advanced tab)  
**Seed dependency:** `10_lux_readings.sql` — 3 sensor readings for Raised Bed A  

### Stage 1 — Add-reading form (LUX-ADV-001 – LUX-ADV-003)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| LUX-ADV-001 | ⬜ | Add-reading form renders in area advanced tab | `area-lux-add-form` visible | ⬜ Not written |
| LUX-ADV-002 | ⬜ | Seeded readings appear in the reading list | `area-lux-reading-item` count ≥ 3 for Raised Bed A | ⬜ Not written |
| LUX-ADV-003 | ⬜ | Adding a manual reading inserts a row | Enter lux value + click Add → new `area-lux-reading-item` visible | ⬜ Not written |

### Stage 2 — Plant light reader save-to-area (LUX-ADV-004)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| LUX-ADV-004 | ⬜ | "Save to area" button visible on light reader when instance has an area | `plant-light-reader-save-to-area` visible for a planted instance | ⬜ Not written |

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
| `ShoppingPage.ts` | `/shopping` |

---

## Section 20 — Garden Layout Builder

**Route:** `/garden-layout` (list) and `/garden-layout/:layoutId` (editor)
**Components:** `GardenLayoutList.tsx`, `GardenLayoutEditor.tsx`, `GardenEditorToolbar.tsx`, `GardenShapePanel.tsx`, `GardenShapeProperties.tsx`, `GardenRuler.tsx`, `GardenScaleBar.tsx`
**Spec file:** `tests/e2e/specs/garden-layout.spec.ts`
**Seed dependency:** None (layouts created during tests; cleaned up by data isolation)

### Stage 1 — Layout list (GLB-001 – GLB-002)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-001 | ✅ | Layout list page loads via nav | `create-layout-btn` visible | ✅ Passing |
| GLB-002 | ✅ | Blank-canvas wizard creates a layout and navigates to editor | `create-blank-canvas` → fill `new-layout-name-input` → `create-layout-confirm` → URL contains `/garden-layout/` and `back-to-layouts-btn` visible | ✅ Passing |

### Stage 2 — Desktop editor toolbar (GLB-006 – GLB-009, Wave 1A/B)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-006 | ✅ | Desktop toolbar single-row with three mode buttons | `editor-toolbar-desktop`, `mode-draw-btn`, `mode-move-btn`, `mode-rotate-btn` visible | ✅ Passing |
| GLB-007 | ✅ | Mode buttons show Draw / Edit / Look labels (rename) | text content matches /Draw/, /Edit/, /Look/ | ✅ Passing |
| GLB-008 | ✅ | View toggles + zoom + settings present in 2D | `view-2d-btn`, `view-3d-btn`, `zoom-in-btn`, `zoom-out-btn`, `canvas-settings-btn` visible | ✅ Passing |
| GLB-009 | ✅ | Switching to 3D hides zoom controls | `zoom-in-btn` count = 0 after `view-3d-btn` click | ✅ Passing |

### Stage 3 — Shape rail sections (GLB-010 – GLB-011, Wave 1D)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-010 | ✅ | Rail has Beds / Structures / Hardscape / Features sections | `rail-section-beds`, `rail-section-structures`, `rail-section-hardscape`, `rail-section-features` all visible | ✅ Passing |
| GLB-011 | ✅ | Known presets render in their sections | `shape-tile-raised-bed`, `shape-tile-greenhouse`, `shape-tile-path`, `shape-tile-pond` visible | ✅ Passing |

### Stage 4 — Mobile toolbar + floating bubble (GLB-012 – GLB-014, Wave 1A)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-012 | ✅ | Mobile toolbar renders two rows + floating bubble | `editor-toolbar-mobile-row-1`, `editor-toolbar-mobile-row-2`, `editor-floating-bubble` visible at 390×844 | ✅ Passing |
| GLB-013 | ✅ | Floating bubble contains view + zoom + settings buttons in 2D | `bubble-view-btn`, `zoom-in-btn`, `zoom-out-btn`, `canvas-settings-btn` inside `editor-floating-bubble` | ✅ Passing |
| GLB-014 | ✅ | Shape rail at bottom is horizontally scrollable with section labels | `shape-rail-mobile` + `rail-section-beds` visible | ✅ Passing |

### Stage 5 — Properties tabs (GLB-015 – GLB-016, Wave 1C)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-015 | ✅ | Drawing a shape opens properties with four tabs (Wave 7D added Photos) | `property-tab-style`, `property-tab-size`, `property-tab-link`, `property-tab-photos` visible | ✅ Passing |
| GLB-016 | ✅ | Style tab shows label/colour, Size tab shows dimensions, Link tab shows delete | tab switches reveal the right fields | ✅ Passing |

### Stage 6 — Living map (Wave 7) — *requires linked area + plants in seed*

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-017 | ⬜ | Shape linked to area with planted plants renders plant tokens | Konva tokens visible inside shape bounding box (counts ≥ 1) | ⬜ Pending seed extension |
| GLB-018 | ⬜ | Shape with active ailments renders coloured ring | dashed coloured stroke at shape bounds | ⬜ Pending seed extension |
| GLB-019 | ⬜ | Pending Tasks section in Link tab shows count + one-tap done | `shape-tasks-list` + `shape-task-done-{id}` clickable | ⬜ Pending seed extension |
| GLB-020 | ✅ | Photos tab opens the timeline | `property-tab-photos` → `shape-photo-timeline` visible | ✅ Passing |

### Stage 7 — Smart map (Wave 8)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-021 | ✅ | Companions toggle visible in toolbar Layers group (3D mode + location) | `toggle-companions-btn` visible | ✅ Passing |
| GLB-022 | ⬜ | AI suggestions button on linked shape | `shape-suggest-btn` visible after linking an area | ⬜ Pending seed extension |

### Stage 8 — Workflows (Wave 9)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-023 | ✅ | Plan filter chip visible on canvas | `canvas-plan-filter` → `plan-filter-trigger` visible | ✅ Passing |
| GLB-024 | ✅ | Plan filter menu opens and shows "All shapes" entry | click trigger → `plan-filter-option-all` visible | ✅ Passing |
| GLB-025 | ⬜ | Quick Actions sheet opens from properties Link tab CTA | `shape-quick-actions-btn` → `shape-quick-actions` visible | ⬜ Pending seed extension |

### Stage 9 — Pro tools (Wave 10)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-026 | ⬜ | Per-shape notes can be added and listed | `shape-notes-add-btn` → input → save → row appears | ⬜ Pending E2E coverage |
| GLB-027 | ⬜ | Planting history shows past plants when shape is linked | `shape-history` lists year sections | ⬜ Pending seed extension |

### Stage 10 — Microclimate report (Wave 11B)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-028 | ✅ | Microclimate Report button opens modal (desktop) | `microclimate-report-btn` → `microclimate-report-modal` visible | ✅ Passing |
| GLB-029 | ✅ | Report modal closes via X | `microclimate-close-btn` click → modal gone | ✅ Passing |

### Stage 11 — Aesthetics (Waves 2 / 6)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-030 | ✅ | Colour palette tabs are visible in Style tab | `palette-tab-foliage`, `palette-tab-hardscape`, `palette-tab-water`, `palette-tab-accents` visible | ✅ Passing |
| GLB-031 | ⬜ | Picking a swatch from a non-foliage palette updates the shape colour | switch palette → click swatch → shape Konva node fill updated | ⬜ Pending E2E |

### Stage 12 — Free-form drawing (Wave 4A)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-032 | ✅ | Free-form Bed tile is visible in shape rail | `shape-tile-curve` visible | ✅ Passing |
| GLB-033 | ⬜ | Drawing 3+ points with Free-form tool produces a smoothed shape | tap canvas points → dblclick → shape persists with curve-bed preset_id | ⬜ Pending E2E |

### Stage 13 — Onboarding & coach marks (Wave 4C)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-034 | ✅ | Empty editor shows a first-shape coach mark | `first-shape-coach` visible when shape count = 0 | ✅ Passing |

### Stage 14 — Undo / Redo + keyboard shortcuts (Wave 5)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-035 | ✅ | Undo/Redo buttons present in toolbar | `undo-btn` and `redo-btn` visible | ✅ Passing |
| GLB-036 | ⬜ | Drawing then pressing Ctrl+Z removes the shape | new shape → Ctrl+Z → shape gone | ⬜ Pending E2E |
| GLB-037 | ⬜ | Ctrl+D duplicates the selected shape | select shape → Ctrl+D → 2 shapes | ⬜ Pending E2E |

### Stage 15 — Smart map polish (sun-fit, snap, long-press, multi-select, right-click)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-038 | ⬜ | Sun-fit badge renders on a linked shape when sun classification known | small ✓/~/! circle in top-left of shape | ⬜ Pending |
| GLB-039 | ✅ | Snap-to-grid toggle visible in toolbar | `toggle-snap-btn` visible | ✅ Passing |
| GLB-040 | ✅ | Right-click on a shape opens context menu | `shape-context-menu` visible with `ctx-duplicate`/`ctx-delete` entries | ✅ Passing |
| GLB-041 | ✅ | Frost / Wind / Companions toggles in toolbar | `toggle-frost-btn`, `toggle-wind-btn`, `toggle-companions-btn` visible | ✅ Passing |

### Stage 16 — Wizard expanded shapes (Wave 4B) + Starter layouts (Wave 12E)

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-042 | ✅ | T-shape and Trapezoid options visible in builder step 1 | `shape-option-t-shape`, `shape-option-trapezoid` visible | ✅ Passing |
| GLB-043 | ✅ | "Starter Layout" entry visible in new-layout wizard | `create-starter-layout` visible | ✅ Passing |
| GLB-044 | ✅ | All three starter templates render | `starter-template-allotment`, `starter-template-front-border`, `starter-template-container` visible | ✅ Passing |

### Stage 17 — Zones + Templates + North sheet + Export

| ID | ❌/✅ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| GLB-045 | ✅ | Zones / Templates / Microclimate / Export launchers in canvas top-right (desktop) | `zones-launch-btn`, `templates-launch-btn`, `microclimate-report-btn`, `export-png-btn` visible | ✅ Passing |
| GLB-046 | ✅ | Tapping canvas compass opens North sheet | `canvas-compass-overlay` click → `north-sheet` visible | ✅ Passing |
| GLB-047 | ⬜ | Zones sheet "Create Zone" disabled with no selection | `zone-create-btn` disabled when `selectedShapeIds` empty | ⬜ Pending E2E |

---

## Section 14 — Community Guides

**Route:** `/guides` (Community Guides tab)
**Components:** `GuideList.tsx`, `CommunityGuidesTab.tsx`, `CommunityGuideEditor.tsx`, `CommunityGuideReader.tsx`
**Spec file:** `tests/e2e/specs/community-guides.spec.ts`
**Seed dependency:** `supabase/seeds/11_community_guides.sql`
- Guide 1: "How to Prune Tomatoes for Maximum Yield" — labels: tomato, pruning, vegetables; 1 star; 2 comments
- Guide 2: "Deep Watering Techniques for Healthy Roots" — labels: watering, roots, soil

### Stage 1 — Tab navigation (CGU-001 – CGU-004)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CGU-001 | ✅ | Rhozly Guides tab visible on /guides | `guides-tab-rhozly` visible | ⬜ Pending |
| CGU-002 | ✅ | Community Guides tab visible on /guides | `guides-tab-community` visible | ⬜ Pending |
| CGU-003 | ✅ | Clicking Community tab shows community list | `community-guides-list` visible | ⬜ Pending |
| CGU-004 | ✅ | Write a Guide button visible on community tab | `write-guide-btn` visible | ⬜ Pending |

### Stage 2 — Seeded guide display (CGU-005 – CGU-006)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CGU-005 | ✅ | Seeded guide 'How to Prune Tomatoes' appears in list | Text visible | ⬜ Pending |
| CGU-006 | ✅ | Seeded guide 'Deep Watering Techniques' appears | Text visible | ⬜ Pending |

### Stage 3 — Reader view (CGU-007 – CGU-010)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CGU-007 | ✅ | Clicking guide card opens reader (star button visible) | `community-guide-star-btn` visible | ⬜ Pending |
| CGU-008 | ✅ | Author sees Edit guide button in reader | `community-guide-edit-btn` visible | ⬜ Pending |
| CGU-009 | ✅ | Seeded comments visible in reader | Comment text visible | ⬜ Pending |
| CGU-010 | ✅ | Back button returns to community list | `community-guides-list` visible | ⬜ Pending |

### Stage 4 — Starring (CGU-011)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CGU-011 | ✅ | Star button toggles star count (star then unstar) | `community-guide-star-btn` text changes: 0 → 1 → 0 | ⬜ Pending |

### Stage 5 — Comments (CGU-012)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CGU-012 | ✅ | Adding a comment appears in thread | Comment text visible after submit | ⬜ Pending |

### Stage 6 — Authoring (CGU-013 – CGU-016)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CGU-013 | ✅ | Write a Guide button opens editor overlay | `community-guide-editor` visible | ⬜ Pending |
| CGU-014 | ✅ | Editor has all required inputs | title, subtitle, labels, publish, draft inputs all visible | ⬜ Pending |
| CGU-015 | ✅ | Publishing a guide shows it in the list | Fill title → Publish → back → guide card visible | ⬜ Pending |
| CGU-016 | ✅ | Author sees Edit button on own guide | `community-guide-edit-btn` visible | ⬜ Pending |

### Stage 7 — Draft isolation (CGU-017)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CGU-017 | ❌ | Draft guide not visible in public community list | Save draft → back → draft title absent from list | ⬜ Pending |

---

## Section 21 — Shopping Lists (/shopping)

**Spec file:** `tests/e2e/specs/shopping.spec.ts`
**Page Object:** `tests/e2e/pages/ShoppingPage.ts`
**Seed dependency:** `12_shopping_lists.sql`

**Mocks required:**
- `**/en.wikipedia.org/api/rest_v1/**` → `{ extract: "A useful plant.", thumbnail: null }`
- `**/functions/v1/search-plants-ai` → canned AI results array
- `**/functions/v1/verdantly-search` → `{ results: [{ id: "v1", common_name: "Tomato", ... }] }`

### Stage 1 — Page structure (SHP-001 – SHP-005)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| SHP-001 | ✅ | Page loads with heading | "Shopping Lists" heading visible | ✅ Passing |
| SHP-002 | ✅ | Seeded active list appears | "Weekly Garden Shop" card visible | ✅ Passing |
| SHP-003 | ✅ | Completed section collapsed by default | `shopping-completed-section-toggle` visible; completed card hidden | ✅ Passing |
| SHP-004 | ✅ | Expanding completed section shows completed list | click toggle → "Last Week's Shop" card visible | ✅ Passing |
| SHP-005 | ✅ | New List button creates a list | click `shopping-new-list-btn` → new card in grid, toast | ✅ Passing |

### Stage 2 — Card interactions (SHP-006 – SHP-011)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| SHP-006 | ✅ | Expanding a card shows its items | click expand toggle → item rows visible | ✅ Passing |
| SHP-007 | ✅ | Checking an item updates progress badge | check unchecked item → x/y count increments | ✅ Passing |
| SHP-008 | ✅ | Rename list via kebab menu | open menu → Rename → type → blur → name updated | ✅ Passing |
| SHP-009 | ✅ | Mark Complete moves list to completed section | click `shopping-mark-complete-{id}` → toast; card in completed section | ✅ Passing |
| SHP-010 | ✅ | Reopen completed list returns it to active | `shopping-reopen-{id}` → card back in active | ✅ Passing |
| SHP-011 | ❌ | Delete requires double-tap confirmation | first click → "Tap again to delete"; second → card gone | ✅ Passing |

### Stage 3 — Add Item (plant/shed search) (SHP-012 – SHP-017)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| SHP-012 | ✅ | Add Item button opens sheet | `shopping-add-item-btn-{id}` → `shopping-add-item-sheet` visible | ✅ Passing |
| SHP-013 | ✅ | Plant tab is default | `shopping-tab-plant` active styling | ✅ Passing |
| SHP-014 | ✅ | Typing name shows shed search results | type "Tomato" → shed results section appears | ✅ Passing |
| SHP-015 | ✅ | Selecting shed result shows preview | click `shopping-plant-result-0` → `shopping-add-plant-confirm` visible | ✅ Passing |
| SHP-016 | ✅ | Confirming shed result adds item to list | confirm → item with plant name visible in list | ✅ Passing |
| SHP-017 | ✅ | "Search All Sources" button appears after shed results | `shopping-fallback-search-all` visible | ✅ Passing |

### Stage 4 — Unified search (AI + Verdantly + Perenual) (SHP-018 – SHP-023)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| SHP-018 | ✅ | Search All Sources shows AI / Verdantly / Perenual result sections | click → result section headings visible | ✅ Passing |
| SHP-019 | ✅ | Info button on AI result expands Wikipedia accordion | click ℹ on `shopping-ai-result-0` → accordion text visible | ✅ Passing |
| SHP-020 | ✅ | Clicking Perenual result opens preview | click `shopping-perenual-result-0` → `shopping-add-plant-confirm` visible | ✅ Passing |
| SHP-021 | ✅ | Confirming Perenual result adds item to list | confirm → item in list | ✅ Passing |
| SHP-022 | ✅ | Shed offer appears after adding plant | `shopping-add-to-shed-skip` + `shopping-add-to-shed-yes` visible | ✅ Passing |
| SHP-023 | ✅ | Skipping shed offer closes sheet | click skip → sheet not visible | ✅ Passing |

### Stage 5 — Product tab (SHP-024 – SHP-025)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| SHP-024 | ✅ | Product tab adds a product item | product tab → fill name + select category → confirm → product row visible | ✅ Passing |
| SHP-025 | ❌ | Product — category required | confirm without category → validation visible, item not added | ✅ Passing |

### Stage 6 — Add Purchased Plants to Shed (SHP-026 – SHP-028)

Seed state: "Weekly Garden Shop" has "Tomato Seedlings" (checked, `source=null`) eligible for shed, and "Mint" (checked, `source='shed'`) excluded.

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| SHP-026 | ✅ | Button visible for eligible checked plant items | `shopping-add-to-shed-btn-{id}` visible in expanded active list | ✅ Passing |
| SHP-027 | ❌ | Shed-sourced plant excluded from button count | button shows "Add 1 Purchased Plant" not "Add 2" (Mint excluded) | ✅ Passing |
| SHP-028 | ✅ | Clicking Add to Shed adds inventory and hides button | click → success toast → `shopping-add-to-shed-btn` not visible | ✅ Passing |

### Section 21b — Shopping edge cases (PR 6)

**Spec file:** `tests/e2e/specs/shopping-edge-cases.spec.ts`

| ID | Test Name | Type | Description | Seed | Mock | Status |
|---|---|---|---|---|---|---|
| SHOP-E-001 | Add Item sheet renders both Plant + Product tabs | ✅ | Expand list → Add Item → both tabs visible | Shopping | — | ✅ Passing |
| SHOP-E-002 | Product tab — name input + category select + confirm button render | ✅ | Switch to Product tab → all three controls visible | Shopping | — | ✅ Passing |
| SHOP-E-003 | Completed section toggle renders when seed has ≥1 completed list | ✅ | `shopping-completed-section-toggle` visible on load | Shopping | — | ✅ Passing |
| SHOP-E-004 | Add-to-Shed button surfaces on the list with seeded pre-checked plants | ✅ | Expand all lists → `shopping-add-to-shed-btn-*` visible | Shopping | — | ✅ Passing |

---

## Section 22 — Companion Plants Tab

**Spec file:** `tests/e2e/specs/companion-plants.spec.ts`
**Seed dependency:** `02_plants_shed.sql` (any seeded shed plant)

**Mocks required:**
- `companion-planting` edge function → `{ beneficial, harmful, neutral }` or `{ error: "ai_required" }`

Edge function mock via `mockEdgeFunction(page, "companion-planting", ...)`.

### Stage 1 — Tab presence and section rendering (CPT-001 – CPT-005)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CPT-001 | ✅ | Companions tab button visible in PlantEditModal | `plant-modal-tab-companions` visible after opening first shed plant | ✅ Passing |
| CPT-002 | ✅ | Clicking tab shows Beneficial section | `companion-section-beneficial` visible | ✅ Passing |
| CPT-003 | ✅ | Beneficial section lists mocked plants | "Basil" and "Marigold" text visible | ✅ Passing |
| CPT-004 | ✅ | Harmful section lists mocked harmful plants | "Fennel" text visible | ✅ Passing |
| CPT-005 | ✅ | Neutral section collapsed by default; expands on click | "Parsley" hidden → click neutral header → "Parsley" visible | ✅ Passing |

### Stage 2 — Interactions (CPT-006 – CPT-007)

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| CPT-006 | ✅ | Add to Shed button appears when a companion is checked; clicking opens PlantSourcePicker | click `companion-plant-verd-123` → `companion-add-to-shed` visible | ✅ Passing |
| CPT-007 | ✅ | ai_required response shows upgrade message | mock returns `{ error: "ai_required" }` → "AI Add-on Required" text visible | ✅ Passing |
| CPT-008 | ⬜ | ⓘ peek populates info pills + description for a companion (library-first, provider fallback) | click `companion-info-{key}` → `companion-info-panel` visible with pills/description; resolution is library → Verdantly/Perenual (no AI) → AI-by-name only on full-guide open. Tapping `companion-open-{key}` opens `PlantDetailModal`, cloning from library/provider when matched. | ⬜ Planned (needs `plant_library` RPC + provider search mock) |

---

## Section 23 — AI Plant Freshness Chip (Wave 5)

**File:** [`tests/e2e/specs/ai-plant-freshness.spec.ts`](../tests/e2e/specs/ai-plant-freshness.spec.ts)
**Seed:** `supabase/seeds/13_ai_freshness.sql` — adds one global AI plant `Cherry Tomato` (id 1000010, `freshness_version=2`, `updated_care_fields=["sunlight","watering_min_days"]`) + a per-home shallow fork (id substituted per worker) + a `user_plant_ack` at version 1 so the chip fires on load.

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| AI-FRESH-001 | ✅ | Shed card shows the Updated chip on the Cherry Tomato | `plant-card` containing "Cherry Tomato" → `ai-updated-chip` visible and contains "fields updated" | ✅ Passing |
| AI-FRESH-002 | ✅ | Opening the plant shows the yellow callout | Click card → `ai-care-update-callout` visible; contains "Sunlight" + "watering" labels | ✅ Passing |
| AI-FRESH-003 | ✅ | Mark as reviewed dismisses the callout | Click `ai-care-mark-reviewed` → callout no longer visible (optimistic local clear) | ✅ Passing |

**Wave 7 (D7) fixed** the seed orchestration bug that blocked these tests. `npm run test:seed` now succeeds against a fresh DB with any worker count.

---

## Section 24 — AI Plant Override Flow (Wave 6)

**File:** [`tests/e2e/specs/ai-plant-override.spec.ts`](../tests/e2e/specs/ai-plant-override.spec.ts)
**Seed:** `supabase/seeds/13_ai_freshness.sql` — extended in Wave 6 to add Lavender (global 1000012 + custom fork 1000013 with `overridden_fields = ["watering_min_days"]`).

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| AI-OVERRIDE-001 | ✅ | Catalogue-tracking plant shows 'Auto-updating' chip in modal | Open Cherry Tomato → `ai-source-chip-catalogue` visible; `ai-source-chip-custom` not visible | ✅ Passing |
| AI-OVERRIDE-002 | ✅ | Custom fork shows 'Custom' chip + Reset button | Open Lavender → `ai-source-chip-custom` visible + `ai-care-reset` visible; Refresh-now hidden | ✅ Passing |
| AI-OVERRIDE-003 | ✅ | Reset opens confirm modal; cancel keeps fork custom | Click Reset → modal opens → Cancel → modal closes, chip still 'Custom' | ✅ Passing |
| AI-OVERRIDE-004 | ✅ | Custom fork's overridden field renders 'Custom' badge inside the form | Open Lavender → form-field-overridden-watering badge visible with "Custom" text | ✅ Passing |

**Wave 7 (D7) fixed** the seed orchestration bug that previously blocked all AI E2E tests. `npm run test:seed` now succeeds against a fresh DB with 1 or 4 workers.

## Section 25 — The Nursery (Seed Packets + Sowings + Plant Out)

**File:** `tests/e2e/specs/nursery-lifecycle.spec.ts`
**Page Object:** `tests/e2e/pages/NurseryPage.ts`
**Seed:** No dedicated seed file — each test wipes packets/sowings + leftover Nursery `inventory_items` in `beforeEach` via a Node-side authenticated Supabase client and seeds its own state through the UI or direct INSERTs.

### Browse + add packets

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| NURSERY-001 | ✅ | Plants / Nursery toggle visible on `/shed` | `shed-view-plants` + `shed-view-nursery` both render under the title | ✅ Passing |
| NURSERY-002 | ✅ | Nursery empty state shows add CTAs | Tap `shed-view-nursery` → `nursery-empty` visible with `nursery-add-empty` + `nursery-paste-empty` buttons | ✅ Passing |
| NURSERY-003 | ✅ | Add Packet — Shed pick path | Tap `nursery-add-empty` → modal opens → search Shed → pick a plant → Next → fill variety + vendor + sow-by → Save → packet appears in the list at status "Sow-by …" | ✅ Passing |
| NURSERY-004 | ✅ | Add Packet — Free-text "add later" path | Tap Add → tick `add-seed-packet-freetext-toggle` → type "Sunflower" → Next → fill details → Save → packet appears with `plant_id = null` (Plant Out is gated) | ✅ Passing |

### Sowing lifecycle

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| NURSERY-010 | ✅ | Log Sowing creates an active sowing | Open packet → tap `packet-detail-log-sowing` → sown_on today, sown_count 12 → Save → SowingRow rendered with `STATUS_LABEL.sown` chip | ✅ Passing |
| NURSERY-011 | ✅ | Observe Germination flips status to "germinated" | Tap `sowing-{id}-observe` → slider = 9 of 12 → Save → status chip "Ready to plant out", row shows "75% sprouted" | ✅ Passing |
| NURSERY-012 | ✅ | Discard sowing transitions to "Discarded" | Tap `sowing-{id}-discard` → confirm → row shows Discarded chip, action bar hidden | ✅ Passing |

### Plant Out — marquee flow

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| NURSERY-020 | ✅ | Plant Out creates inventory_items row with from_sowing_id | Observe 9 of 12 → tap `sowing-{id}-plant-out` → pick Location + Area → quantity 9 → Save → sowing flips to `planted_out`; Shed has a new instance with growth_state Seedling and quantity 9 | ✅ Passing |
| NURSERY-021 | ✅ | Partial plant-out keeps sowing at "germinated" with remaining count | Plant out 6 of 9 → sowing stays at "germinated" with "3 still on the bench" hint when Plant Out is re-opened | ✅ Passing |
| NURSERY-022 | ✅ | Plant Out fires AutomationEngine — care schedules generate | After NURSERY-020, the new inventory_items row has at least one matching `task_blueprints` row anchored to the picked area | ✅ Passing |
| NURSERY-023 | ✅ | Plant Out disabled when packet.plant_id is null | Free-text-added packet → observe sowing → `sowing-{id}-plant-out` button disabled with link-plant tooltip | ✅ Passing |
| NURSERY-024 | ✅ | "From the Nursery" badge surfaces on Instance Edit Modal | After NURSERY-020, open the new instance from the Shed → `instance-from-nursery-badge` renders with sown date + germination count | ✅ Passing |

### Bulk paste

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| NURSERY-030 | ✅ | Paste a list — regex path (Sprout/Botanist) | Tap `nursery-paste-packets` → paste 3 well-formed lines → tap `bulk-paste-parse` → review step shows 3 editable rows | ✅ Passing |
| NURSERY-031 | ✅ | Bulk save inserts all parsed rows | Tap `bulk-paste-save` → toast confirms "Added 3 packets"; Nursery list shows them with `plant_id = null` | ✅ Passing |
| NURSERY-032 | ✅ | Bulk paste row editing flows through to save | Paste 1 line → review → edit variety inline → save → packet has the edited variety | ✅ Passing |
| NURSERY-033 | ✅ | AI parse path (Sage+ — mocked) | With AI enabled, parse mocked → review step shows AI-source label, rows editable | ✅ Passing (mocked) |

### Task + Care Guide integration

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| NURSERY-040 | ✅ | AddTaskModal shows Nursery packet picker on Planting type | Open AddTaskModal → set type to "Planting" → `nursery-packet-picker` visible with packet options | ✅ Passing |
| NURSERY-041 | ✅ | Picking a packet pre-fills title + description | Pick a packet → title auto-fills "Sow {variety} ({plant})"; description appended with "From your {vendor} packet in The Nursery." | ✅ Passing |
| NURSERY-042 | ✅ | Care Guide tab pill shows packets for the plant | Open Tomato plant → Care tab → `care-guide-nursery-packets` visible; expand → list of matching packets with status chips | ✅ Passing |

### Shopping list refill banner

| ID | ✅/❌ | Description | Assertions | Status |
|----|------|-------------|------------|--------|
| NURSERY-050 | ✅ | Banner renders when packets need refilling | Seed a packet with sow_by within 90 days + an active list → open /shopping → `seed-refill-banner` visible | ✅ Passing |
| NURSERY-051 | ✅ | "Add to {list}" adds one item per refill | Tap `seed-refill-banner-add` → toast confirms "Added N packet refills"; the named list grows by N rows | ✅ Passing |
| NURSERY-052 | ✅ | Banner hides when no refills due / no active list | With no packets in refill state OR no active list → banner not rendered | ✅ Passing |

