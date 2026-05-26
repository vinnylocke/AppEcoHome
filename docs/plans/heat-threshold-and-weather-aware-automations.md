# Lower heat alert threshold + add weather-aware automations

## Goal

Two related changes:

1. **Lower the hot-weather notification threshold** from 32°C to 25°C. Notification message already says "Plants may need extra water" — no copy change needed.

2. **Add a "Weather-aware" parent setting to automations** that umbrellas the existing rain-skip toggle plus a new heat-trigger toggle:
   - **Skip when it's rained** (already exists as `skip_if_rained` + `rain_threshold_mm`).
   - **Trigger automatically when it's hot** (new — fire the automation on its scheduled time on hot days, even without a task due that day).

The "Weather-aware" parent is a UI grouping — derived state, not a new column — so existing rows with `skip_if_rained = true` still work without backfill.

## App-reference files consulted

- [`docs/app-reference/99-cross-cutting/27-weather.md`](docs/app-reference/99-cross-cutting/27-weather.md) — confirms the heatwave rule is in `_shared/weatherRules/heatwave.ts` and the snapshot exposes `daily.temperature_2m_max[]` (Open-Meteo standard). The runner can read that directly.
- [`docs/app-reference/99-cross-cutting/11-cron-jobs.md`](docs/app-reference/99-cross-cutting/11-cron-jobs.md) — confirms `run-automations` is an hourly cron that fires automations whose `scheduled_time` matches the current UTC hour. Heat trigger will reuse the same hourly cron window.
- [`docs/app-reference/06-integrations/`](docs/app-reference/06-integrations/) — for the automation modal surface (already touched the file directly).

**Drift to flag:** the Automation modal + weather refs will need a follow-up update to describe the new toggle. Logging in this plan; not a full rewrite.

---

## Change 1 — Heat threshold

[`supabase/functions/_shared/weatherRules/heatwave.ts:6`](supabase/functions/_shared/weatherRules/heatwave.ts#L6):

```ts
const HEAT_THRESHOLD_C = 32;   // → 25
```

That's it. The message already names the actual forecast temp + tells the user plants may need extra water.

---

## Change 2 — Weather-aware automations

### Schema

New migration `20260526120000_automations_heat_trigger.sql`:

```sql
ALTER TABLE automations
  ADD COLUMN trigger_if_hot       boolean  NOT NULL DEFAULT false,
  ADD COLUMN heat_threshold_c     numeric  NOT NULL DEFAULT 28;
```

Defaults to off — no existing automation behaviour changes.

### Runner logic — `supabase/functions/run-automations/index.ts`

1. Add `checkHeat(homeId, thresholdC)` mirroring `checkRain`, reading `daily.temperature_2m_max[todayIdx]` from the weather snapshot.
2. In `runAutomation`:
   - Rain check stays exactly where it is (and still wins — if it rained, skip whether or not it's also hot, because plants got watered by rain).
   - Replace the `checkControllingTaskDue` short-circuit with: `taskDue || hotTrigger`. Specifically — if `automation.trigger_if_hot` and `checkHeat()` returns hot, treat the run as eligible even when no task is due.
3. Adjust the run-status reason: when heat triggers a fire that wouldn't have happened by task alone, record `triggered_by: 'schedule'` and add a flag to the result for the notification.
4. Notification copy: when heat triggered the run, title becomes `"<name> watered (hot weather)"`.

### UI — `src/components/integrations/AutomationModal.tsx`

The Settings section gets a small refactor:

- **New parent toggle** "Weather-aware" — derived UI-only state (`skipIfRained || triggerIfHot`).
- When OFF: collapses both sub-settings, sets `skip_if_rained = false` and `trigger_if_hot = false` on save.
- When ON: reveals the existing rain-skip controls + a new heat-trigger row:
  - "Run automatically when it's hot" toggle.
  - "Above X°C" numeric input (default 28, min 20, max 45).

The existing standalone "Retry on failure" stays outside Weather-aware — unrelated.

### Types

Update `AutomationFull` in [`src/components/integrations/AutomationsSection.tsx`](src/components/integrations/AutomationsSection.tsx) to include the two new fields.

---

## Risks & edge cases

- **Backward compat**: existing automations land with `trigger_if_hot = false`. The parent toggle is derived state, so rows that already had `skip_if_rained = true` keep working — the toggle just renders as ON when reloaded.
- **Hot AND rained**: rain skip wins. Documented in plan + comment in runner.
- **Heat trigger fires on the scheduled time only**: not "the moment it's hot". This keeps the cron sweep simple and avoids surprise off-hours firings. Documented in the toggle's helper text.
- **`heat_threshold_c` default = 28°C** — slightly above the new 25°C *notification* threshold so the automation isn't over-eager. Tunable per-automation.
- **No tests** for the runner — the function already lacks unit-level test coverage (it's integration-tested by the e2e cron sweep). The schema change is straight ALTER and the runner change is a tight conditional.

---

## Files

| File | Change |
|---|---|
| `supabase/functions/_shared/weatherRules/heatwave.ts` | `HEAT_THRESHOLD_C: 32 → 25` |
| `supabase/migrations/20260526120000_automations_heat_trigger.sql` | NEW — add two columns |
| `supabase/functions/run-automations/index.ts` | Add `checkHeat`; new condition in `runAutomation`; updated notification copy |
| `src/components/integrations/AutomationModal.tsx` | Wrap rain settings + new heat row under a parent "Weather-aware" toggle |
| `src/components/integrations/AutomationsSection.tsx` | Type update for `AutomationFull` |

---

## Steps

1. Update heatwave threshold (1-line change).
2. Write + apply schema migration locally.
3. Add `checkHeat` + heat-trigger condition in runner.
4. Refactor Settings section in AutomationModal — parent toggle + heat row.
5. Update `AutomationFull` type.
6. Typecheck. Run unit tests.
7. Push migration to remote (with explicit confirmation).
8. Deploy via `npm run deploy --bump 1`.
