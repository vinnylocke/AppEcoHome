# Plan — Automation date-range trigger (calendar dates + season presets)

## Problem
The automation "time/day" trigger only does **weekly** schedules (weekday + time slots).
Users want **calendar dates** — a month or a range like *Jan 1 – Jan 9* — and **season
presets** (pick "Summer" → it fills the right dates, hemisphere-aware).

## Approach
Add a new condition leaf kind **`date_range`** (recurring annually): `{ kind: "date_range",
from: "MM-DD", to: "MM-DD" }`. Evaluates true when today's month-day (in the home tz) is
within `[from, to]`, handling year-wrap (e.g. southern summer `12-01 → 02-28`). This sits
alongside the existing `time` leaf, so users can combine "between 1 Jun and 31 Aug" with
"weekdays 06:00–08:00" etc.

Season/month presets reuse the existing **`getSinglePeriodRange(period, hemisphere)`**
(`src/lib/seasonal.ts`), which already maps "summer"/"january"/… → `{start, end}` MM-DD,
hemisphere-aware. The builder derives hemisphere from the home (`getHemisphere(country,
timezone)`).

## App-reference consulted
- [`07-management/06-integrations-automations.md`](../app-reference/07-management/06-integrations-automations.md) (builder + condition tree)
- [`99-cross-cutting/29-seasonality.md`](../app-reference/99-cross-cutting/29-seasonality.md) (hemisphere/season logic)
- [`99-cross-cutting/11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md) (evaluate-automations)

## Changes

### Types + summary (both mirrors)
- `src/lib/conditionTree.ts` **and** `supabase/functions/_shared/conditionTree.ts`:
  - Add `date_range` to the `ConditionNode` union + `LeafKind`/`LeafNode`.
  - `newLeaf("date_range")` → default to the current month (`MM-01 … MM-<end>`).
  - `summariseNode` → e.g. "date is between 1 Jan and 9 Jan".

### Engine evaluation
- `_shared/conditionTree.ts`: pure `isWithinDateRange(now, from, to, tz)` — current MM-DD
  via `Intl.DateTimeFormat`, lexicographic compare, wrap when `to < from`.
- `supabase/functions/evaluate-automations/index.ts`: `leafEval` gains
  `case "date_range": return isWithinDateRange(now, leaf.from, leaf.to, leaf.tz ?? homeTz)`.

### Builder UI
- `ConditionNodeEditor.tsx`: add `"date_range"` to `LEAF_KINDS` ("Date range") + a
  `DateRangeFields` component:
  - Two **date pickers** (`<input type="date">`, year ignored — store/parse `MM-DD`) for
    From / To, so a user can pick "Jan 1 → Jan 9".
  - **Preset chips**: Spring · Summer · Autumn · Winter (hemisphere-aware via
    `getSinglePeriodRange`), plus "Whole month" convenience. Clicking fills From/To.
- `AutomationBuilderModal.tsx`: load the home's `country`/`timezone`, compute
  `hemisphere` via `getHemisphere`, pass it through `BuilderCtx` so presets resolve
  correctly.

### Helper
- `src/lib/dateRangeLeaf.ts` (new, pure): `mmdd(date)`, `formatMmDd("MM-DD") → "9 Jan"`,
  `seasonPreset(season, hemisphere)` (thin wrapper over `getSinglePeriodRange`). Reused by
  the editor + summary. Mirror the formatter in `_shared` for `summariseNode`.

## Files
| File | Change |
|------|--------|
| `src/lib/conditionTree.ts` | type + newLeaf + summariseNode |
| `supabase/functions/_shared/conditionTree.ts` | type + isWithinDateRange + summariseNode |
| `supabase/functions/evaluate-automations/index.ts` | leafEval case |
| `src/components/integrations/ConditionNodeEditor.tsx` | DateRangeFields + presets + LEAF_KINDS |
| `src/components/integrations/AutomationBuilderModal.tsx` | hemisphere → ctx |
| `src/lib/dateRangeLeaf.ts` (new) + `_shared` formatter | MM-DD format + season preset |
| tests (Vitest + Deno) | below |
| docs | automations surface + seasonality refs |

## Tests
- **Deno**: `isWithinDateRange` — inside, outside, wrap-year (12-01→02-28), tz boundary;
  `summariseNode` date_range wording.
- **Vitest**: `newLeaf("date_range")`, `summariseNode`, `formatMmDd`, `seasonPreset`
  (north vs south summer/winter).

## Risks
- **Year-wrap** is the main edge — covered by tests. Feb 29 falls outside `02-28`-bounded
  ranges in leap years (matches the existing seasonal lib; acceptable).
- Additive leaf kind — existing automations unaffected; engine has a `default`-safe switch
  (new case added, exhaustive).
- No schema change (the leaf lives in the existing `trigger_logic` jsonb).

## Deploy
`supabase functions deploy evaluate-automations` + `deploy-app-only` → commit + push. No migration.
