# Plan — 21.0004: Today tab cleanup, stale weather alerts, harvest doubling, title clarity

Four asks bundled into one minor release. Each independent and reversible.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) — pollen pipeline (cron-fed, silent fallback)
- [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md) — three current placements
- [`docs/app-reference/02-dashboard/10-localized-task-calendar.md`](../app-reference/02-dashboard/10-localized-task-calendar.md) — the Today tab component graph
- [`docs/app-reference/02-dashboard/08-weather-alert-banner.md`](../app-reference/02-dashboard/08-weather-alert-banner.md) — alert read sites
- [`docs/app-reference/99-cross-cutting/27-weather.md`](../app-reference/99-cross-cutting/27-weather.md) — alert lifecycle
- [`docs/app-reference/04-schedule/01-blueprint-manager.md`](../app-reference/04-schedule/01-blueprint-manager.md) — blueprint model + harvest window contract
- [`docs/app-reference/99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — tasks schema, window_end_date, tombstones
- [`docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `generate-tasks` cron is the one creating duplicates

---

## 1. Pollen — answered, no code change

Pollen will reappear automatically every day after the 02:00 UTC `fetch-pollen` cron runs. The user's snapshot is now populated (manual trigger). When pollen data is absent (regions outside Open-Meteo's coverage, or before first cron run), the section is silently omitted by design.

---

## 2. Remove SeasonalPicksCard from the Today tab

Delete one line + one import in [`LocalizedTaskCalendar.tsx`](../../src/components/quick/LocalizedTaskCalendar.tsx) (currently line 12 + line 194). SeasonalPicksCard stays on Dashboard + `/quick` home. Docs touched: `02-dashboard/14-seasonal-picks.md` (drop `variant="today"`) + `02-dashboard/10-localized-task-calendar.md` (remove from graph).

---

## 3. Expire stale weather alerts

**Bug confirmed.** Today is 2026-06-05. The `weather_alerts` table has 6 rows where `is_active=true` and `starts_at` is days in the past (heat warning for May 30, rain alerts for June 3 and June 4). The `analyse-weather` function only upserts new alerts on `(location_id, type)`; it never deactivates old ones, so once a heat alert fires it stays "active" forever.

**Fix:** at top of each `analyse-weather` run, deactivate rows whose `starts_at` is more than 24h in the past. Plus a defensive read-side filter (`is_active=true` AND `starts_at >= now()-24h`) on whichever query reads the table for display. Plus a one-shot UPDATE in prod to clean the 6 existing stale rows immediately.

24-hour grace window because morning rain alerts should stay visible the rest of the day.

---

## 4. Harvest doubling — the real bug (new diagnosis)

**User report:** "after skipping a harvest task it now seems to have doubled up so it's showing 2 of the same harvest tasks on the same day" — and confirmed both rows show the same chip ("11 strawberries"), so it's the same blueprint duplicating, not two distinct blueprints.

**Root cause found.** The `generate-tasks` cron is harvest-unaware:

```ts
// supabase/functions/generate-tasks/index.ts (current behaviour)
for (const bp of blueprints || []) {
  // ... no special handling for harvest blueprints
  tasksToInsert.push({
    home_id: bp.home_id,
    blueprint_id: bp.id,
    title: bp.title,
    type: bp.task_type,
    due_date: nextDate.toISOString().split("T")[0],
    location_id: bp.location_id,
    // ⚠️ NO window_end_date here — even when the blueprint has end_date
  });
}
```

`git log -S "window_end_date" -- supabase/functions/generate-tasks/index.ts` returns **zero commits** — `window_end_date` has never been set by this cron. The Wave 20 harvest-window model lives only on the frontend ghost engine + `buildGhostPayload` ([`src/lib/taskMutations.ts:26`](../../src/lib/taskMutations.ts#L26)), which preserves `window_end_date` when the user interacts with a ghost.

So the prod state is mixed:
- Tasks created via ghost interaction (user skipped/postponed) → `window_end_date` set correctly
- Tasks created by the daily cron → `window_end_date = NULL`

For the user's Strawberries blueprint `ea36804f`:
| due_date | status | window_end_date | how it was created |
|----------|--------|-----------------|--------------------|
| Jun 1–8 | Skipped | 2026-08-31 | ghost interaction |
| Jun 9 | **Pending** | **2026-08-31** | ghost interaction (the canonical window task) |
| Jun 10 | **Pending** | **NULL** | `generate-tasks` cron |
| Jun 11 | **Pending** | **NULL** | `generate-tasks` cron |

The frontend treats the Jun 9 task as "active across window" (Jun 9 → Aug 31) and shows it on every in-window day. On Jun 10, the user sees:
- The window task (Jun 9 with `window_end_date=2026-08-31`, active on Jun 10)
- PLUS the cron-created plain task at Jun 10

→ Two rows, same blueprint, same chip. Same pattern on every future day until `generate-tasks` runs out of week-ahead headroom.

**Fix has three parts:**

### 4a. Make `generate-tasks` harvest-aware

In the blueprint loop, skip blueprints that are harvest + have end_date:

```ts
for (const bp of blueprints || []) {
  // Harvest blueprints with an end_date follow the Wave-20 window model
  // — the frontend ghost engine emits ONE ghost at start_date with
  // window_end_date set. The user materialises via interaction. Daily
  // cron materialisation creates duplicate non-window tasks that show
  // alongside the canonical window task across the visible window.
  if ((bp.task_type === "Harvesting" || bp.task_type === "Harvest") && bp.end_date) {
    continue;
  }
  // ... existing daily-cycle logic for non-harvest blueprints
}
```

### 4b. Defensive client-side de-dup

In the frontend engine ([`src/lib/taskEngine.ts`](../../src/lib/taskEngine.ts) — after ghost generation, before returning the combined `[...rawTasks, ...ghosts]`):

```ts
// Per-blueprint defence: for harvest blueprints, if there's a Pending
// task with window_end_date set (the canonical), drop any Pending tasks
// from the SAME blueprint whose window_end_date is null and whose
// due_date falls inside the canonical window. Belt-and-braces for old
// data the migration cleanup might have missed.
const canonical = new Map<string, { start: string; end: string }>();
for (const t of rawTasks) {
  if (
    (t.type === "Harvesting" || t.type === "Harvest")
    && t.window_end_date
    && t.blueprint_id
    && t.status === "Pending"
  ) {
    const existing = canonical.get(t.blueprint_id);
    if (!existing || t.due_date < existing.start) {
      canonical.set(t.blueprint_id, { start: t.due_date, end: t.window_end_date });
    }
  }
}
const dedupedRaw = rawTasks.filter((t) => {
  if (!t.blueprint_id) return true;
  if (t.status !== "Pending") return true;
  if (t.type !== "Harvesting" && t.type !== "Harvest") return true;
  if (t.window_end_date) return true;
  const c = canonical.get(t.blueprint_id);
  if (!c) return true;
  // Hide non-window Pending if it falls inside a canonical window
  return !(t.due_date >= c.start && t.due_date <= c.end);
});
```

### 4c. One-shot prod cleanup

After deploy, run a single SQL against prod:

```sql
DELETE FROM tasks
WHERE id IN (
  SELECT t.id
  FROM tasks t
  JOIN task_blueprints b ON b.id = t.blueprint_id
  WHERE t.status = 'Pending'
    AND t.window_end_date IS NULL
    AND b.task_type IN ('Harvesting', 'Harvest')
    AND b.end_date IS NOT NULL
);
```

I'll do this via a node script using the service role key so the impact and row count are visible in the logs.

---

## 5. Title clarity — DROPPED on user feedback

User declined: "you can see the plants easily below it, plus sometimes you may not have any plants linked." The plant chip already does the disambiguation work; once the harvest doubling root cause (§4) is fixed, the user won't see same-blueprint duplicates anymore, so the title-suffix carry-cost (and the no-plants edge case) isn't worth it.

---

## Files modified

| File | Change |
|------|--------|
| [`src/components/quick/LocalizedTaskCalendar.tsx`](../../src/components/quick/LocalizedTaskCalendar.tsx) | Drop SeasonalPicksCard import + render |
| [`supabase/functions/analyse-weather/index.ts`](../../supabase/functions/analyse-weather/index.ts) | Add stale-alert deactivation pass at top of run |
| [`src/App.tsx`](../../src/App.tsx) or [`src/components/WeatherAlertBanner.tsx`](../../src/components/WeatherAlertBanner.tsx) | Add `is_active=true` + `starts_at >= now()-24h` filter on the read query (whichever owns the fetch) |
| [`supabase/functions/generate-tasks/index.ts`](../../supabase/functions/generate-tasks/index.ts) | Skip harvest blueprints with end_date |
| [`src/lib/taskEngine.ts`](../../src/lib/taskEngine.ts) | Per-blueprint canonical dedup pass after ghost generation |
| [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md) | Drop `variant="today"` |
| [`docs/app-reference/02-dashboard/10-localized-task-calendar.md`](../app-reference/02-dashboard/10-localized-task-calendar.md) | Drop SeasonalPicksCard from graph |
| [`docs/app-reference/99-cross-cutting/27-weather.md`](../app-reference/99-cross-cutting/27-weather.md) | Document 24h alert expiry |
| [`docs/app-reference/04-schedule/01-blueprint-manager.md`](../app-reference/04-schedule/01-blueprint-manager.md) | Note generate-tasks now skips harvest-with-end_date |
| [`docs/app-reference/99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) | Note canonical-window dedup invariant |

## One-shot prod ops (post-deploy, in order)

1. **UPDATE stale weather_alerts** → `is_active = false WHERE is_active=true AND starts_at < now()-24h`
2. **DELETE bad harvest tasks** → the SELECT JOIN DELETE from §4c above
3. Both via node scripts so the row counts are logged

## Tests

- **Vitest** — unit test the new canonical-dedup helper in `taskEngine` against three fixtures: (a) one canonical + two non-window duplicates → 1 row, (b) only non-window tasks → all kept, (c) no harvest tasks → unchanged.
- **Deno** — extend `analyse-weather` test (or new test file) for the stale-alert deactivation pass.
- **E2E (docs only)** — add row to `docs/e2e-test-plan.md` for "Today tab does NOT show SeasonalPicksCard".

## Deploy

- Two function deploys: `generate-tasks`, `analyse-weather`.
- Vercel frontend.
- Standard minor bump → 21.0004.
- One-shot prod data ops AFTER deploy, before marking complete.

## Risks

- **Skipping harvest blueprints in `generate-tasks`** is the right call but is the most behavioural change — losing daily materialisation for harvest tasks is intentional (the window model handles it). Worth eyeballing the user's `/schedule` after deploy to confirm no harvest tasks went missing.
- **Title suffix** is purely cosmetic; safest change.
- **Dedup pass** is filtered narrowly to Pending + Harvesting + window_end_date NULL, so it can't hide non-harvest tasks or canonical window tasks.
- **24h alert expiry** is generous on purpose.
- **The one-shot DELETE** is scoped via JOIN to harvest-with-end_date blueprints + NULL window_end_date — won't touch watering, pruning, etc. Tested live by running the SELECT first and reporting the row count before the DELETE.
