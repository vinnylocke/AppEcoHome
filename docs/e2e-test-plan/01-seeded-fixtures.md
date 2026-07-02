# Seeded fixtures — UUID + plant ID convention

The canonical reference for every fixture ID the E2E suite touches. Cross-linked from CLAUDE.md and per-section files. **If a UUID anywhere in the suite doesn't match this file, this file is wrong and needs updating.**

---

## Parallel worker accounts

E2E tests run with up to **4 parallel workers**, each backed by its own isolated Supabase account. The worker account is derived automatically from `PLAYWRIGHT_WORKER_INDEX` in `tests/e2e/fixtures/auth.ts` — no `TEST_USER_EMAIL` env var is needed. Each account has a distinct UUID prefix so workers never share data.

| `PLAYWRIGHT_WORKER_INDEX` | Account | Used by `scripts/seed-test-db.mjs` worker number | UUID prefix |
|---|---|---|---|
| 0 | `test1@rhozly.com` | `w=1` | `00000001-0000-0000-` |
| 1 | `test2@rhozly.com` | `w=2` | `00000002-0000-0000-` |
| 2 | `test3@rhozly.com` | `w=3` | `00000003-0000-0000-` |
| 3 | `test4@rhozly.com` | `w=4` | `00000004-0000-0000-` |

Password for all accounts: `TestPassword123!`.

**The seed script's worker number `w` is 1-based** — `scripts/seed-test-db.mjs` substitutes `00000000` → `0000000${w}` and `1000011` → `${w + 1}00011`. Both Playwright `workerIndex` (0-based) and the seed's `w` (1-based) point at the same account: `workerIndex = w - 1`.

---

## Fixtures — worker 1 (`test1@rhozly.com`)

Replace the `00000001` prefix with `00000002`/`00000003`/`00000004` for the other workers. Plant IDs follow their own substitution rule (see plants section).

### Identity

```
TEST_USER_ID         = 00000001-0000-0000-0000-000000000001
TEST_HOME_ID         = 00000001-0000-0000-0000-000000000002
```

### Locations + Areas (`01_locations_areas.sql`)

```
LOC_GARDEN_ID        = 00000001-0000-0000-0001-000000000001  (Outside Garden)
LOC_INDOOR_ID        = 00000001-0000-0000-0001-000000000002  (Indoor Space)

AREA_RAISED_BED_ID   = 00000001-0000-0000-0002-000000000001  (Raised Bed A)
AREA_BORDER_ID       = 00000001-0000-0000-0002-000000000002  (South Border)
AREA_GREENHOUSE_ID   = 00000001-0000-0000-0002-000000000003  (Greenhouse)
AREA_WINDOWSILL_ID   = 00000001-0000-0000-0002-000000000004  (Kitchen Windowsill)
AREA_LIVING_ROOM_ID  = 00000001-0000-0000-0002-000000000005  (Living Room)
```

### Plants — integer PKs (`02_plants_shed.sql`)

The seed script substitutes `100000{n}` (n=1..6) → `${w + 1}00000{n}`. **Worker 1 (test1) plants land at `2000001..2000006`**, not `1000011`. The older fixture table that claimed worker 0 → `1000011` was wrong; verified by querying the DB in PR 9.

| Name | Worker 1 ID | Worker 2 | Worker 3 | Worker 4 | Source | Status |
|---|---|---|---|---|---|---|
| Tomato | `2000001` | `3000001` | `4000001` | `5000001` | manual | active |
| Basil | `2000002` | `3000002` | `4000002` | `5000002` | manual | active |
| Rose | `2000003` | `3000003` | `4000003` | `5000003` | manual | active |
| Boston Fern | `2000004` | `3000004` | `4000004` | `5000004` | manual | active |
| Mint | `2000005` | `3000005` | `4000005` | `5000005` | manual | archived |
| Lavender | `2000006` | `3000006` | `4000006` | `5000006` | api | active |

### Inventory items — UUIDs at the `0004-` prefix (`02_plants_shed.sql`)

```
INV_TOMATO_ID        = 00000001-0000-0000-0004-000000000001  (Tomato — Unplanted/In Shed)
INV_BASIL_ID         = 00000001-0000-0000-0004-000000000002  (Basil — Planted in Raised Bed A)
INV_ROSE_ID          = 00000001-0000-0000-0004-000000000003  (Rose — Planted in South Border)
INV_FERN_ID          = 00000001-0000-0000-0004-000000000004  (Boston Fern — Planted on Windowsill)
INV_ARCHIVED_ID      = 00000001-0000-0000-0004-000000000005  (Mint — Archived)
INV_LAVENDER_ID      = 00000001-0000-0000-0004-000000000006  (Lavender — Unplanted/In Shed)
```

### Task blueprints — UUIDs at `0005-` (`03_tasks_blueprints.sql`)

```
BP_WATER_WEEKLY_ID   = 00000001-0000-0000-0005-000000000001  (Weekly Watering — all garden)
BP_WATER_BASIL_ID    = 00000001-0000-0000-0005-000000000002  (Basil Watering)
BP_PRUNE_ROSE_ID     = 00000001-0000-0000-0005-000000000003  (Rose Pruning — seasonal)
BP_INSPECT_FERN_ID   = 00000001-0000-0000-0005-000000000004  (Fern Inspection — weekly)
BP_HARVEST_ID        = 00000001-0000-0000-0005-000000000005  (Tomato Harvest)
BP_FERTILIZE_ID      = 00000001-0000-0000-0005-000000000006  (Monthly Fertilizing)
BP_PEST_CONTROL_ID   = 00000001-0000-0000-0005-000000000007  (Aphid Pest Control)
BP_MAINTENANCE_ID    = 00000001-0000-0000-0005-000000000008  (General Garden Maintenance)
BP_DAILY_CHECK_ID    = 00000001-0000-0000-0005-000000000009  (Daily Garden Check — freq=1)

# PR 7 Optimise tab fragmentation pair (added in 22.0040 era):
BP_OPT_FRAG_A_ID     = 00000001-0000-0000-0005-00000000000a  (Greenhouse Cucumber Watering — 7d)
BP_OPT_FRAG_B_ID     = 00000001-0000-0000-0005-00000000000b  (Greenhouse Pepper Watering — 3d)
```

### Standalone physical tasks — UUIDs at `0006-` (`03_tasks_blueprints.sql`)

`blueprint_id = NULL` on all of these so re-running the seed doesn't trip the `unique_blueprint_date` constraint. Due dates are `CURRENT_DATE`-relative.

```
TASK_PENDING_ID      = 00000001-0000-0000-0006-000000000001  (Watering — Pending, due today)
TASK_COMPLETED_ID    = 00000001-0000-0000-0006-000000000002  (Inspection — Completed, today)
TASK_SKIPPED_ID      = 00000001-0000-0000-0006-000000000003  (Fertilizing — Skipped, yesterday)
TASK_OVERDUE_ID      = 00000001-0000-0000-0006-000000000004  (Maintenance — Pending, -7 days)
TASK_PRUNING_TODAY   = 00000001-0000-0000-0006-000000000005  (Rose Hedge Pruning — today)
TASK_WATERING_ID     = 00000001-0000-0000-0006-000000000006  (Water Basil Plants — today)
TASK_FERTILIZE_ID    = 00000001-0000-0000-0006-000000000007  (Apply Organic Fertilizer — today)
TASK_PRUNING_FUTURE  = 00000001-0000-0000-0006-000000000008  (Deadhead Roses — +5 days)
TASK_HARVEST_ID      = 00000001-0000-0000-0006-000000000009  (Harvest Tomatoes — in-window today)
TASK_INSPECT_ID      = 00000001-0000-0000-0006-000000000010  (Fern Health Check — today)
TASK_PEST_ID         = 00000001-0000-0000-0006-000000000011  (Aphid Treatment — today)
TASK_MAINTAIN_ID     = 00000001-0000-0000-0006-000000000012  (Clear Weeds — tomorrow)
TASK_PLANTING_ID     = 00000001-0000-0000-0006-000000000013  (Plant Seedlings — today)

# Harvest-window contract (Wave 20+):
TASK_PUMPKIN_CLOSED  = 00000001-0000-0000-0006-000000000020  (Pumpkin Final Harvest — window closed -2d)
TASK_STRAWBERRY_SNZ  = 00000001-0000-0000-0006-000000000021  (Strawberry Snooze Test — next_check_at +2d)
```

### Ailments — UUIDs at `0007-` (`06_ailments_watchlist.sql`)

```
AILMENT_APHID_ID     = 00000001-0000-0000-0007-000000000001  (Aphid — pest, active)
AILMENT_BLIGHT_ID    = 00000001-0000-0000-0007-000000000002  (Early Blight — disease, active)
AILMENT_IVY_ID       = 00000001-0000-0000-0007-000000000003  (Japanese Knotweed — invasive_plant)
AILMENT_ARCHIVED_ID  = 00000001-0000-0000-0007-000000000004  (Powdery Mildew — disease, archived)
```

### Plans — UUIDs at `0008-` (`05_planner.sql`)

```
PLAN_ACTIVE_ID       = 00000001-0000-0000-0008-000000000001  (Summer Veg Plan — In Progress)
PLAN_COMPLETED_ID    = 00000001-0000-0000-0008-000000000002  (Spring Cleanup — Completed)
PLAN_ARCHIVED_ID     = 00000001-0000-0000-0008-000000000003  (Winter Prep — Archived)
```

### Community guides — UUIDs at `0010-` (`11_community_guides.sql`)

```
COM_GUIDE_PRUNE_ID   = 00000001-0000-0000-0010-000000000001  (How to Prune Tomatoes — labels: tomato, pruning)
COM_GUIDE_WATER_ID   = 00000001-0000-0000-0010-000000000002  (Deep Watering Techniques)
```

### Shopping lists — UUIDs at `0011-` (`12_shopping_lists.sql`)

```
LIST_ACTIVE_ID       = 00000001-0000-0000-0011-000000000001  (Weekly Garden Shop — active)
LIST_COMPLETE_ID     = 00000001-0000-0000-0011-000000000002  (Last Week's Shop — completed)
```

### AI plant freshness + override forks (`13_ai_freshness.sql`)

Per-worker substitution is `1000011` → `${w + 1}00011`. Worker 1 (test1) forks land at `200011` and `200013`.

| Plant | Worker 1 | Worker 2 | Worker 3 | Worker 4 | Notes |
|---|---|---|---|---|---|
| Cherry Tomato (global catalogue) | `1000010` | `1000010` | `1000010` | `1000010` | Shared across workers. `freshness_version=2`, `updated_care_fields=["sunlight","watering_min_days"]`. |
| Cherry Tomato (per-home shallow fork) | `200011` | `300011` | `400011` | `500011` | `forked_from_plant_id=1000010`, `overridden_fields=[]`. |
| Lavender (global catalogue) | `1000012` | `1000012` | `1000012` | `1000012` | Shared. `watering_min_days=7`. |
| Lavender (per-home CUSTOM fork) | `200013` | `300013` | `400013` | `500013` | `forked_from_plant_id=1000012`, `overridden_fields=["watering_min_days"]`. |

**Important:** these fork IDs look like leftover plants from old `plant-doctor` runs but they're NOT — they're load-bearing seed data for `ai-plant-freshness.spec.ts` and `ai-plant-override.spec.ts`. Don't scrub plants where `id < 1_000_000 AND source = 'ai'` in any `beforeAll` cleanup; it will delete these and silently break 7 tests across two specs.

### Integrations telemetry — UUIDs at `0013-`–`0016-` (`13_integrations.sql`)

Backs the Home dashboard's Phase 2 sensor/valve chips (`home-overview` endpoint). The soil sensor sits on Raised Bed A (`0002-...001`) with a `now()`-stamped reading (moisture 45% / 18.5 °C / battery 82% → chip reads "Soil: OK" / "45%", never stale-grey); the water valve sits on South Border (`0002-...002`) with a `turn_on` valve event 2 hours ago (600 s run → always idle by test time, never "running"). `credentials_encrypted` is a placeholder — nothing in the suite decrypts it.

```
INTEGRATION_ECOWITT  = 00000001-0000-0000-0013-000000000001  (ecowitt, active, region eu)
DEVICE_SOIL_SENSOR   = 00000001-0000-0000-0014-000000000001  (Raised Bed A Sensor — soil_sensor, battery 82%)
DEVICE_WATER_VALVE   = 00000001-0000-0000-0014-000000000002  (South Border Valve — water_valve)
READING_SOIL_FRESH   = 00000001-0000-0000-0015-000000000001  (device_readings — re-stamped to now() every seed run)
VALVE_EVENT_LAST_RUN = 00000001-0000-0000-0016-000000000001  (valve_events — turn_on, now() - 2h, 600s)
```

> The `0013-` block is shared with the Head Gardener continuity log below — different tables (`integrations` vs `garden_manager_log`), so the identical UUID strings never collide.

### Head Gardener — UUIDs at `0013-` (`14_head_gardener.sql`)

`garden_brief` and `garden_manager_reports` are keyed by `home_id` (one row per home); the continuity log uses the `0013-` block.

```
GARDEN_BRIEF         = keyed by home_id 00000001-0000-0000-0000-000000000002  (confirmed)
MANAGER_REPORT       = keyed by home_id (cached Estate Report, persona=experienced)
MANAGER_LOG_GAP_ID   = 00000001-0000-0000-0013-000000000001  (open gap — winter colour)
MANAGER_LOG_FEED_ID  = 00000001-0000-0000-0013-000000000002  (acted follow-up — fed tomatoes)
```

Brief: goals `grow_your_own, year_round_colour, attract_wildlife` · styles `cottage, kitchen_veg` · time `1_3h` · experience `improving`. Evergreen-gated (set the test account tier to `evergreen` to exercise the Head Gardener tab).

### Rhozly guides (shared across all workers)

```
GUIDE_WATERING_ID    = 00000000-0000-0000-0009-000000000001  (Watering Basics — Beginner)
GUIDE_PRUNING_ID     = 00000000-0000-0000-0009-000000000002  (Pruning Techniques — Intermediate)
GUIDE_COMPOSTING_ID  = 00000000-0000-0000-0009-000000000003  (Composting 101 — Beginner)
```

---

## Seed script reference

```bash
# Recommended for E2E — seeds all 4 workers, runs the suite
npm run test:e2e:fresh

# Re-seed only (idempotent — safe to re-run at any time without resetting)
npm run test:seed

# Nuclear option — wipes DB and re-applies migrations + seed
supabase db reset --local && npm run test:seed
```

All seed files use `ON CONFLICT DO UPDATE`, so re-running is safe. Seeds that reference `CURRENT_DATE` (tasks, weather) refresh their date fields on every run.

**Seed files applied in order** (per worker):

| File | Contents |
|---|---|
| `00_bootstrap.sql` | Auth user, profile, home, home_members |
| `01_locations_areas.sql` | 2 locations, 5 garden areas |
| `02_plants_shed.sql` | 6 plants + 6 inventory items |
| `03_tasks_blueprints.sql` | 10 blueprints + 15 standalone tasks + Optimise-tab fragmentation pair |
| `04_weather.sql` | 7-day forecast + 4 weather alerts (each with `dates` + `ends_at`; the heat alert is a grouped 3-day heatwave: today → +2) |
| `05_planner.sql` | 3 plans (In Progress, Completed, Archived) |
| `06_ailments_watchlist.sql` | 4 ailments (3 active, 1 archived) |
| `07_guides.sql` | 3 Rhozly guides |
| `08_profile_preferences.sql` | Quiz completion + 5 preferences |
| `09_stats.sql` | 1 prune task + 1 ailment link for Basil |
| `09_cross_home_markers.sql` | Worker-2 markers for cross-home RLS tests (applied last) |
| `10_lux_readings.sql` | 3 sensor readings on Raised Bed A |
| `10_yield.sql` | 3 yield records on Basil + expected_harvest_date |
| `11_community_guides.sql` | 2 published guides with stars + comments |
| `12_shopping_lists.sql` | 2 lists (1 active, 1 completed) with 6 items |
| `13_ai_freshness.sql` | Cherry Tomato + Lavender catalogue + per-home forks |
| `13_integrations.sql` | Ecowitt integration + soil sensor (Raised Bed A, fresh reading) + water valve (South Border, 2h-old run) |
| `14_head_gardener.sql` | Confirmed Garden Brief + cached Estate Report + 2 continuity-log entries |

> **Lost or corrupted seed data?** `npm run test:seed` restores it. Each seed file is independent.
