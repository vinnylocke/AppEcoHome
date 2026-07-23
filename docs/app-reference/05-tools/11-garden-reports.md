# Garden Reports

> Your garden's month and year in review — tasks completed, new plants, prunes, harvests and weather events, with month-on-month deltas, a 12-month breakdown and "Wrapped-style" highlights. Fully built earlier as an email-report companion view, but **never routed — surfaced in the dashboard-nav-tasks-tray redesign Stage 5 (2026-07-21, B16; locked decision: surface it)**.

**Route:** `/reports` (lazy-loaded; lights the **Tools** nav item via its `matchPaths`).
**How to reach it:** Tools hub → *Measure & Track* → **Garden Reports** tile (`tools-hub-garden-reports`).
**Source files:** `src/components/GardenReports.tsx` (the view) · `src/hooks/useGardenReport.ts` (all data fetching + pure stat helpers).

---

## Quick Summary

One screen, two views behind a toggle (`reports-view-toggle`): **Monthly** (stat cards for the picked month with deltas vs the previous month, a per-type task breakdown, month navigation) and **Year in Review** (12-month totals, a per-month chart, and generated highlight lines — busiest month, top task type, plants added, harvests, weather events). All numbers are computed **client-side** from existing home-scoped tables — no edge function, no new storage.

---

## Role 1 — Technical Reference

### Component graph

```
GardenReports ({ homeId })
├── View toggle (reports-view-toggle; reports-toggle-monthly / reports-toggle-yearly)
├── MonthlyReview (view === "monthly")
│   ├── Month navigation (prev / next)
│   ├── StatCard grid (tasks done, new plants, pruned, harvested, weather events — each with a DeltaBadge vs last month)
│   └── Task-type breakdown (per-TaskCategory colour bars)
└── YearlyReview (view === "yearly")
    ├── Year navigation
    ├── Totals row + per-month bar chart
    └── Highlights list (generateHighlights)
```

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `profile.home_id` (App route) | Scopes every query |

### State (local)

- `view` (`"monthly" | "yearly"`), `selectedMonth` (first of current month), `selectedYear` — all local; no URL state.

### Data flow — read paths (all client-side via `useGardenReport`)

| Query | Source table | Contributes |
|-------|-------------|-------------|
| Completed tasks in range | `tasks` (status Completed, by `completed_at`-window) | `tasksCompleted`, `tasksByType` |
| Items planted in range | `inventory_items` | `newPlants` |
| Yields recorded in range | `yield_records` | `harvested` |
| Alerts in range | `weather_alerts` (via the home's `locations`) | `weatherEvents` |

Monthly fetches the picked month + the previous month and diffs them (`subtractStats`) for the delta badges; yearly fetches 12 month-buckets, sums them (`sumStats`), and derives `highlights` (`generateHighlights` — busiest month, top task type, plants added, harvests, weather). The pure helpers are exported for unit tests (`tests/unit/hooks/useGardenReport.test.ts`).

### Data flow — write paths

None — strictly read-only.

### Edge functions invoked

None from this surface. (The separate `garden-reports` email pipeline generates emailed recaps from its own cron — this screen computes its numbers independently, client-side.)

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `generate-tasks` + user completions | Feed the completed-task counts |
| `sync-weather` / `analyse-weather` | Feed `weather_alerts` → weather-events count |

### Realtime channels / Tier gating / Beta gating

None — identical for every tier; no subscriptions (numbers refresh on month/year navigation or remount).

### Permissions

Read-only over home-scoped tables; RLS's home-membership gate is sufficient (no spatial/`can()` keys involved).

### Error states

| State | What happens |
|-------|--------------|
| Query fails | The hook resolves with empty stats — cards render zeros (no error UI; acceptable for a retrospective view) |
| No data in range | Zero-value cards / an empty highlights list |

### Performance

- Lazy route chunk; month view = 2 month-windows of 4 parallel queries, year view = 12 buckets. All cheap indexed reads.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

It's your garden's memory. A month from now you won't remember whether February was busy or quiet, how many harvests you pulled, or when you planted the most — this screen does. The Monthly view answers "how did this month compare to last?"; the Year in Review is your garden's "Wrapped" — the busiest month, your most common job, everything you added and picked.

### Every flow on this screen

1. **Check the month** — open Reports (Tools → Garden Reports), read the stat cards; the little up/down badges compare against the previous month.
2. **Walk back in time** — the ‹ › arrows step through past months.
3. **See the year** — flip the toggle to *Year in Review* for totals, a month-by-month chart, and the highlight lines.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Tasks done | Tasks you completed in the window (all types) |
| Task-type bars | The same tasks split by Watering / Pruning / Planting / Harvesting / Maintenance |
| New plants | Plants added to your garden in the window |
| Pruned / Harvested | Pruning tasks done / yields recorded |
| Weather events | Alerts (frost, heat, wind, rain) your home logged |
| ▲ / ▼ badge | Up or down vs the previous month ("same" when unchanged) |
| Highlights (yearly) | Generated one-liners — busiest month, top task type, totals |

### Tier-by-tier experience

Identical for every tier.

### Common mistakes / pitfalls

- **Expecting live numbers.** It's a retrospective — it counts what you *recorded*. Harvests only count if you logged a yield; tasks only count if you ticked them off.
- **Confusing it with the Weekly Overview.** Weekly (`/weekly`) looks *forward* at the week ahead; Reports looks *backward* at months and years.

### Recommended workflows

- **Month-end ritual:** open Reports, skim the deltas, note what slipped (a falling Watering count in a hot month is a flag).
- **New-year planning:** read the Year in Review before writing next season's plan — the busiest-month highlight tells you where your labour actually goes.

### What to do if something looks wrong

- **Zeros everywhere:** the window genuinely has no recorded activity — check you're on the month you meant.
- **A harvest you remember is missing:** it was never logged as a yield — add it from the plant's Yield tab and the report will count it.

---

## Related reference files

- [Tools Hub](./01-tools-hub.md) — the Measure & Track tile that opens this
- [Weekly Overview Page](../02-dashboard/15-weekly-overview.md) — the forward-looking sibling
- [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md) · [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md) · [Weather](../99-cross-cutting/27-weather.md)
- [Stats Tab](../06-account/04-stats-tab.md) — the per-gardener lifetime stats (this screen is per-home, per-window)

## Code references for ongoing maintenance

- `src/components/GardenReports.tsx` — the view (toggle, MonthlyReview, YearlyReview, StatCard/DeltaBadge)
- `src/hooks/useGardenReport.ts` — fetching + the exported pure helpers (`subtractStats`, `sumStats`, `generateHighlights`)
- `src/App.tsx` — the `/reports` route (lazy) + `/reports` in the Tools nav `matchPaths`
- `src/components/ToolsHub.tsx` — the `garden-reports` tile
- `tests/e2e/specs/stage4-discoverability.spec.ts` — DISC-B16
