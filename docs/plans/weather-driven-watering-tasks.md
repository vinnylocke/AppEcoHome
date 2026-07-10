# Weather-driven watering tasks (opt-in home setting)

**Date:** 2026-07-10 · **Ask:** a setting so weather events don't just notify "you may need extra watering" but **create actual watering tasks** — grouped per area over planted instances (bearing in mind planted-but-unassigned plants), skipping areas that already have a watering task today, extensible to other weather events, and still auto-completable by automations. Must not regress dashboard task counts.

## App-reference consulted
- [`99-cross-cutting/27-weather.md`](../app-reference/99-cross-cutting/27-weather.md) — weather rules / snapshots / alerts pipeline.
- [`99-cross-cutting/11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md) — sync-weather (hourly) → analyse-weather; generate-tasks (daily); daily-batch-notifications.
- [`99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — tasks columns, `unique_blueprint_date`, `inventory_item_ids uuid[]`, type CHECK.
- [`99-cross-cutting/10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — analyse-weather / fanoutActions.
- [`99-cross-cutting/12-notifications.md`](../app-reference/99-cross-cutting/12-notifications.md) + `notificationPrefs` — `weatherAlerts` pref, `shouldNotify`, notification dedup + claims.
- [`99-cross-cutting/09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md) — automations, `automation_actions.complete_task`.
- [`99-cross-cutting/17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md) — **weather features are not tier-gated**; this stays all-tier.
- [`02-dashboard/17-home-main.md`](../app-reference/02-dashboard/17-home-main.md) — "X of Y done today" count sources (the regression-prone area).

## How the existing system works (facts that shape the design)

1. **Weather rules are pure** (`_shared/weatherRules/`): `evaluate(ctx) → WeatherRuleResult { alerts, taskAutoCompletes, notifications }`. They run **hourly** inside `analyse-weather` (invoked by `sync-weather`). `rainAutoComplete` already *completes* watering tasks (`taskAutoCompletes` → `auto_completed_reason: "Auto-completed: X mm rainfall"`); `heatwave` currently only notifies "needs extra water". **There is no create-task path yet** — we add one, modelled on the existing result shape.
2. **Automations complete tasks ONLY by blueprint**: `fanoutActions.ts` `complete_task` filters `.eq("blueprint_id", action.target_blueprint_id)` — a standalone task (blueprint_id NULL) is invisible to it. Weather tasks will be standalone → **fanoutActions must be extended** or automations won't auto-complete them (explicit user requirement).
3. **Counts require `location_id`**: `buildLocationTaskCounts` is fed by a query filtered `.in("location_id", locationIds)` — a task with NULL location never enters the pending count, but *would* count in `computeDoneToday` when completed → "2 of 1"-style corruption. **Every created task must carry a real `location_id`.**
4. **Instances**: `inventory_items.status = 'Planted'`; `area_id` nullable (planted-but-unassigned), `location_id` nullable. Areas belong to locations, so area → location is derivable.
5. **Standalone tasks bypass `unique_blueprint_date`** — nothing prevents duplicates, so idempotency must be explicit. Precedent: `notification_claims` atomic send-once (weekly overview) — the established fix for the duplicate-invocation class (analyse-weather runs hourly).
6. **Home-level settings precedent**: columns on `homes` (`automation_window_enabled` etc.), edited from Integrations → Automations.

## Personas — what "right" looks like

- **Beginner**: today they get a notification ("heatwave — may need extra watering") and have to translate it into action themselves. With the setting on, concrete tasks appear in Today ("Extra watering — Raised Bed A" with plant chips) that they can tick off — the app tells them *what to do*, not just *what's happening*. The heatwave notification copy nudges discovery of the setting. Risk: task overload in a week-long heatwave → mitigated by one-task-per-area-per-day + skip-if-already-watering.
- **Experienced**: hates noise and duplicates; already runs routines + valve automations. So: **opt-in (default OFF)**; skips areas already covered by a watering task or a due-today watering blueprint (their routine wins); one grouped task per area (never per plant); their valve automation still auto-completes it; rain still auto-completes it (falls out free — the tasks are ordinary outdoor Watering tasks, which `rainAutoComplete` already targets).

## Design

### A. Extensible rule→task registry (server)
Extend `WeatherRuleResult` with `taskCreates?: WeatherTaskCreate[]` (sibling of `taskAutoCompletes`):
```ts
interface WeatherTaskCreate {
  ruleId: string;                  // "heatwave" — used in the claim key
  taskType: "Watering";            // v1; frost→Maintenance etc. later
  titleTemplate: string;           // "Extra watering — {area}"
  description: string;             // "Heatwave (up to 31°C)… created from your weather setting"
}
```
**v1 emits from `heatwave` only** (the unambiguous watering case). The registry shape is what makes expansion cheap: frost → "Protect tender plants", high wind → "Check stakes & supports", waterlogging → "Check drainage" are later one-rule additions with different `taskType`/templates — no new plumbing.

### B. Task creation handler (in `analyse-weather`, new pure `_shared/weatherTaskCreation.ts`)
Runs after rules evaluate, per home, **only if `homes.weather_task_creation = true`**:
1. Fetch `inventory_items` where `status='Planted'` for the home (id, plant_name, area_id, location_id).
2. **Group per area**: one prospective task per area with `inventory_item_ids` = that area's planted instances (exactly the "don't create loads" requirement). Resolve the task's `location_id` from the area's location.
3. **Unassigned instances** (area_id NULL): group per `location_id` into one "Extra watering — unassigned plants" task per location. Instances with **neither area nor location get NO task** — creating one would corrupt the location-keyed counts (fact 3). Instead the notification appends "N planted plants aren't in an area — check them too."
4. **Dedup against today**: skip an area/location group if a non-Skipped Watering task due today already exists for it (same `area_id`, or inventory overlap), **or** a watering blueprint for that area is due today on its frequency grid (mirror generate-tasks' projection) — the user's routine covers it. (Self-healing: our own created task satisfies this check on the next hourly run.)
5. **Idempotency claim** (belt-and-braces + delete-safe): before inserting, atomically claim `weather-task:{homeId}:{ruleId}:{YYYY-MM-DD}:{areaId|locId}` via the `notification_claims`-style mechanism (reuse the table if its shape is key-generic; else a minimal `weather_task_claims`). Hourly re-runs and user-deleted tasks can never re-create.
6. **Insert** standalone tasks: `{ home_id, blueprint_id: null, title, description, type: 'Watering', due_date: today, location_id, area_id, inventory_item_ids, weather_event_key }`.
7. **Notification** (respecting `weatherAlerts` pref + existing dedup): copy switches from "may need extra watering" to "Heatwave — added extra watering tasks for {N} areas". When the setting is OFF, the current notification stays but gains a one-line nudge: "Tip: Rhozly can create these as tasks automatically — Settings → Automations."

### C. `tasks.weather_event_key` (new nullable text column)
Marks weather-created tasks: `heatwave:2026-07-10:{areaId}`. Used for (a) automation targeting (D), (b) a small "Weather task" chip (Sun/Thermometer icon) in TaskList, (c) debuggability. Existing table → no Data-API grant needed.

### D. Automations auto-complete (the explicit requirement)
Extend `fanoutActions.ts` `complete_task`: after the blueprint-keyed completion, look up the target blueprint's `(task_type, area_id)` and ALSO complete standalone tasks where `weather_event_key IS NOT NULL AND type = task_type AND area_id = bp.area_id AND due_date <= today AND status IN (Pending, Postponed)` with the same `auto_completed_reason: "automation"`. So a valve automation that waters Raised Bed A completes the weather watering task for Raised Bed A. Rain auto-complete needs **zero change** — weather tasks are ordinary outdoor Watering tasks it already matches.

### E. The setting + UI
- Migration: `ALTER TABLE homes ADD COLUMN weather_task_creation boolean NOT NULL DEFAULT false;` (opt-in).
- UI (**user decision 2026-07-10**): the toggle renders in **GardenerProfile's notification/alert settings area**, adjacent to the existing "Weather alerts" notification toggle — a "Weather actions" row with its own icon, explainer ("Create watering tasks automatically during heatwaves"), and sub-label **"Applies to everyone in {home}"**. Storage stays **home-scoped** (`homes.weather_task_creation`) — tasks are home-wide, so this is deliberately NOT a `notification_prefs` entry (per-user values would conflict, and task creation must be independent of whether a user has muted notifications). The row reads the flag from `homes` and updates it directly; RLS governs who can write (failed update → toast). `data-testid="weather-task-creation-toggle"`. The heatwave notification nudge (B7) points here.

### F. Dashboard counts — regression checklist (each verified in tests)
| Surface | Why it's safe |
|---|---|
| `buildLocationTaskCounts` (pending) | Tasks always carry a real `location_id` (fact 3; groups without one are never created). Standalone Pending row counts once; no blueprint → no ghost interplay. |
| Engine `buildRenderTasks` | Standalone task due today passes through untouched (no window, no blueprint). |
| `computeDoneToday` | Completed today or due today → counts once. |
| `computeDayStrip` / weekly tiles | Plain-task bucketing on due day — nothing new. |
| Ghost suppression | No blueprint_id → cannot suppress or duplicate any ghost. |
| Overdue | If unwatered, tomorrow it's a normal overdue task (correct: the need was real). |

## Files
**Server:** `_shared/weatherRules/index.ts` (result type), `_shared/weatherRules/heatwave.ts` (emit `taskCreates`), **new** `_shared/weatherTaskCreation.ts` (pure: grouping, dedup, payload build — fully Deno-testable), `analyse-weather/index.ts` (wire handler + claims + notification copy), `_shared/fanoutActions.ts` (D).
**Migrations:** `homes.weather_task_creation`; `tasks.weather_event_key`; claims table only if `notification_claims` isn't reusable.
**Client:** Automations page card (toggle); `TaskList.tsx` weather chip (small); no count-code changes by design.

## Tests (mandatory)
- **Deno** (`supabase/tests/weatherTaskCreation.test.ts`): grouping (multi-area, unassigned-with-location, neither → excluded + counted for the notification line); dedup (existing task today per area; blueprint due today on grid; own-task self-heal); payload always has `location_id`; claim key format. Heatwave rule emits `taskCreates`; other rules don't. `fanoutActions` completes a weather task in the blueprint's area and leaves other areas/types alone.
- **Vitest**: `locationTaskCounts` — a standalone weather task row counts once as pending and its Completed row isn't counted (already-covered pattern, extended with a weather-shaped row); TaskList chip render.
- **e2e-test-plan**: rows for the toggle + a created-task appearance (seed-dependent, may be doc-only initially).
- **Live verification**: locally seed a hot snapshot → run analyse-weather → assert tasks grouped/deduped/claimed; toggle off → nothing; complete via automation path; check "X of Y done today" arithmetic before/after completion.

## Risks / notes
- **Hourly cron double-fire** → claims make creation once-per-day-per-area, delete-safe (memory: duplicate-invocation → atomic claim).
- **Indoor plants**: heatwave watering applies to outdoor primarily; v1 filters groups to instances whose location `is_outside` (same scoping rainAutoComplete uses). Indoor greenhouse nuance deferred.
- **Long heatwaves** create at most one task per area per day, and only on days the rule fires AND no watering already exists — bounded noise.
- **Type CHECK** already allows 'Watering' — no constraint change.
- Deploy = migrations first locally, then standard `npm run deploy`.

## Open decisions (resolved 2026-07-10)
1. **Default OFF** (opt-in) with the notification nudge — approved.
2. **v1 event = heatwave only**; frost/wind/waterlogging follow via the registry — approved.
3. **Toggle placement — user amended:** GardenerProfile → Notifications → "Weather actions" (next to the weather-alerts notification toggle), storage still home-scoped on `homes` (see § E).
4. **Plants with no area AND no location get no task** (notification mention instead) — approved.

## Delivered (2026-07-10)

Shipped as planned. Server: `WeatherRuleResult.taskCreates` + `NotificationPayload.ruleId` (stripped before notification insert — it's not a column); `heatwave` emits a Watering `taskCreate` with `onDates`; pure `_shared/weatherTaskCreation.ts` (`buildWeatherTasks`, `isBlueprintDueToday`); `analyse-weather` handler (flag-gated fetch → group → dedup → claim → insert → notification copy amend); `fanoutActions.complete_task` weather sweep. Migrations: `homes.weather_task_creation` (default false), `tasks.weather_event_key` + partial index, `weather_task_claims` (service-role only). Client: GardenerProfile "Weather actions" home-scoped toggle; TaskList amber "Weather task" chip.

**Live-verified on the local stack** (service-role-seeded 32°C snapshot; the browser can't write `weather_snapshots` — RLS, correctly):
- Coverage-free run → **3 tasks, one per area** (Greenhouse ×11 plants, South Border ×1, Raised Bed A ×1), each with real `location_id` + `area_id`, correct `weather_event_key`, due today.
- **Real-data suppression validated by accident:** the first run created nothing because two seeded location-level watering blueprints were genuinely due today on their grids — exactly the "routine wins" design.
- **Hourly idempotency:** second run → no new tasks. **Delete-safety:** deleted one, third run → not resurrected (claims held; claims table invisible to the browser by design).
- **Notification copy:** "…We've added 3 extra watering tasks for today."
- **Toggle:** renders under "Weather actions", flips `homes.weather_task_creation` true↔false in the DB, left OFF; probe cleanup removed created tasks.

**Tests:** Deno `weatherTaskCreation.test.ts` WTC-001..015 (grouping incl. unassigned/unplaced/indoor, onDates gating, area/location/home-wide/instance-overlap dedup, paused-blueprint non-suppression, grid math, heatwave emission) + `fanoutWeatherComplete.test.ts` FAN-WX-001/002 (mock-db: weather sweep completes the area's weather task with `auto_completed_reason: "automation"`; no sweep for area-less blueprints). Vitest `locationTaskCounts` +2 (standalone weather row counts once pending / not when Completed). Note: rule-file imports in tests must go via the `WEATHER_RULES` barrel (direct import → the documented circular-import TDZ).
