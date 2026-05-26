# Plan — Plant Library admin: repeat-with-interval scheduling

## Goal

Let the admin set "run seed for N plants, repeat T times, every M minutes" from the admin page, then walk away. Server-side state so it survives browser close. Cancel button to stop a running schedule.

## App-reference consulted

- [07-management/10-plant-library-admin.md](../app-reference/07-management/10-plant-library-admin.md) — admin surface, current run controls
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — existing pg_cron patterns (daily seed/verify use pg_net.http_post)
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `seed-plant-library` payload shape

## Design

### 1. New table — `plant_library_run_schedules`

```sql
CREATE TABLE public.plant_library_run_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('seed', 'verify')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  count_per_run integer NOT NULL CHECK (count_per_run > 0 AND count_per_run <= 5000),
  total_runs integer NOT NULL CHECK (total_runs > 0 AND total_runs <= 100),
  runs_completed integer NOT NULL DEFAULT 0,
  interval_minutes integer NOT NULL CHECK (interval_minutes >= 1 AND interval_minutes <= 1440),
  next_run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz,
  last_error text
);

CREATE INDEX plant_library_run_schedules_active_due_idx
  ON public.plant_library_run_schedules (next_run_at)
  WHERE status = 'active';
```

RLS: admin-only SELECT/INSERT/UPDATE/DELETE (mirrors `plant_library_runs` policies).

### 2. Postgres tick function + cron

A plpgsql function `tick_plant_library_schedules()` runs every minute via pg_cron. It:

1. Selects all active schedules where `next_run_at <= now()` (uses the partial index).
2. For each row:
   - Calls `seed-plant-library` (or `verify-plant-library`) via `pg_net.http_post` with `{ count: count_per_run, triggered_by: <created_by uuid as text> }`. Fire-and-forget — pg_net is async.
   - `runs_completed = runs_completed + 1`
   - `last_triggered_at = now()`
   - If `runs_completed >= total_runs` → `status = 'completed'`
   - Else → `next_run_at = now() + interval '<interval_minutes> minutes'`
3. On HTTP error: store reason in `last_error`, leave `next_run_at` unchanged (will retry on next tick — but we cap to skip after 3 consecutive failures by adding a `consecutive_failures` counter; simpler: just leave `status='active'` and rely on the admin seeing `last_error` + Cancel button).

We already use `pg_net.http_post` from cron jobs for the existing daily seed/verify schedules — same pattern.

**Cron schedule:** `* * * * *` (every minute). 1-minute granularity is fine for "every 10 minutes" precision (worst case: first fire 60s after submission, subsequent fires within ±30s of intended slot).

### 3. UI changes — `PlantLibraryAdmin.tsx`

In the existing seed/verify Run controls, add two extra inputs **inside an "Advanced" disclosure** that defaults closed (so the simple single-run flow stays unchanged):

```
[Plants per run: 100]  [Run seed]
  ▶ Repeat & schedule

  ▼ Repeat & schedule
    Number of runs: [10]      (default 1; cap 100)
    Minutes between runs: [10] (default 10; cap 1440 = 24h)
    Start at: now             (fixed; first run fires on next cron tick)
```

When `total_runs === 1`: call the edge function directly as today (immediate).
When `total_runs > 1`: insert into `plant_library_run_schedules` instead. First run fires within 60s.

### 4. New panel — Active schedules

Above the Recent runs table, when any active schedule exists:

```
┌──────────────────────────────────────────────────────────┐
│ Active schedules                                         │
├──────────────────────────────────────────────────────────┤
│ Seed · 100/run · 3 of 10 done · next in 7 min   [Cancel] │
│ Verify · 500/run · 1 of 5 done · next in 22 min [Cancel] │
└──────────────────────────────────────────────────────────┘
```

- Polls every 15s (cheaper than the 3s runs poll).
- Cancel → `UPDATE plant_library_run_schedules SET status = 'cancelled' WHERE id = ...`. Next tick skips cancelled rows.

### 5. Service helpers (`plantLibraryAdminService.ts`)

```ts
export interface PlantLibraryRunSchedule { /* mirror DB */ }

export async function createPlantLibrarySchedule(input: {
  kind: 'seed' | 'verify';
  countPerRun: number;
  totalRuns: number;
  intervalMinutes: number;
}): Promise<PlantLibraryRunSchedule>;

export async function cancelPlantLibrarySchedule(id: string): Promise<void>;

export async function fetchActivePlantLibrarySchedules(): Promise<PlantLibraryRunSchedule[]>;
```

## Files

| File | Change |
|------|--------|
| `supabase/migrations/20260624001900_plant_library_run_schedules.sql` | New table + RLS + `tick_plant_library_schedules()` plpgsql + pg_cron `* * * * *` |
| `src/services/plantLibraryAdminService.ts` | Three new helpers |
| `src/components/admin/PlantLibraryAdmin.tsx` | Repeat/interval inputs + Active schedules panel + cancel UX |

## App-reference updates required

- `docs/app-reference/07-management/10-plant-library-admin.md` — document the new scheduling controls + Active schedules panel
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` — add the new `tick_plant_library_schedules` 1-min cron

## Risks

- **Tick fires while a previous run from the same schedule is still running.** Each schedule entry has its own `next_run_at`, so this won't double-fire one schedule. But it CAN overlap with a long-running 1000-plant manual run someone separately triggered — that's fine (different run rows, ON CONFLICT handles any race).
- **HTTP failure on dispatch.** pg_net is async — we can't observe the response synchronously. We store nothing useful in `last_error` from a fire-and-forget call. Acceptable: the seed function logs its own failures into `plant_library_runs`, which the admin already watches.
- **Schedule outlives a deploy.** A schedule row survives `supabase functions deploy`. As long as the seed function's body shape doesn't change incompatibly, that's fine.
- **No backfill / no start-time picker.** "Start at: now" is fixed. Adding "start at 02:00 tomorrow" is a future enhancement; not in scope.

## Sequencing

1. Write migration (table + tick function + cron job).
2. Apply locally (`supabase migration up`) — verify the tick function compiles + the cron registers.
3. Add service helpers + UI controls + panel.
4. Typecheck (Deno not needed; just `npx tsc --noEmit`).
5. Apply migration to remote (`supabase db push` — on your go-ahead).
6. Deploy `--bump 1`.
