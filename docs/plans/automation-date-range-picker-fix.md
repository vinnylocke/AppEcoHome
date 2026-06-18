# Plan — Fix the date-range picker showing a confusing year (2024)

## Problem
The new automation date-range trigger uses `<input type="date">`. Since the leaf is
year-agnostic ("MM-DD"), the input is fed a placeholder year (2024), so clicking a season
preset shows dates like *01/06/2024 – 31/08/2024* — the "2024" looks random/wrong, and
hemisphere ranges that wrap New Year (e.g. winter 1 Dec → 28 Feb) render with the "to"
date appearing *before* the "from" in the same year, which looks broken.

## Approach
Replace the two date inputs with **month + day `<select>`s** (no year at all). The stored
value stays `"MM-DD"`; season presets are unchanged. A wrapped range (to < from) shows a
small "(into next year)" hint so it reads clearly.

## Changes
- `src/lib/dateRangeLeaf.ts`: add `MONTH_LABELS`, `daysInMonth(month)`, `splitMmDd(mmdd)`,
  `makeMmDd(month, day)` (clamps day to the month length). Keep existing helpers.
- `src/components/integrations/ConditionNodeEditor.tsx`: `DateRangeFields` uses a new
  `MonthDayPicker` (month select + day select) for from/to; add the wrap hint.
- Tests: Vitest for `splitMmDd`/`makeMmDd`/`daysInMonth` (incl. clamping 31→30/28).
- Docs: note the picker is month/day (no year).

No engine change (`isWithinDateRange` already operates on MM-DD). Client-only deploy.

## Risks
- Day clamping when switching to a shorter month (e.g. 31 → Feb) — covered by `makeMmDd`
  + test.
