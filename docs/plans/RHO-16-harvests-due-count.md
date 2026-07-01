# RHO-16 — "Garden This Week → Harvests Due" always 0 despite active harvest windows

**Jira:** RHO-16 · Bug · Medium. **Same root cause as [RHO-14](RHO-14-tasks-this-week-counts.md) + [RHO-15](RHO-15-week-overview-counts.md).**

## Problem
The "Garden This Week" panel shows Harvests Due = 0 even when there are active harvest ranges
covering part of this week.

## Root cause
`harvestBlueprintsDue` is derived from the week-bounded task set —
[home-dashboard-stats/index.ts:236-241](../../supabase/functions/home-dashboard-stats/index.ts#L236-L241)
(`harvestTasks = tasks.filter(type ∈ {Harvesting,Harvest} && status !== Skipped)` then
`new Set(harvestTasks.map(t => t.id)).size`). Two defects:
1. Source `tasks` is `due_date`-in-week only ([:64-65](../../supabase/functions/home-dashboard-stats/index.ts#L64-L65)),
   so harvest windows whose start (`due_date`) is before `weekStart` — the exact "range covering half
   this week" case — are excluded → count 0. (Seed: `scripts/seed-test-account.mjs:507-508` creates
   `Harvesting` tasks with `window_end_date` that legitimately span the week.)
2. It dedupes by `t.id`, not by plant/blueprint — so "Harvests Due" (ticket: how many *different
   plants* have a harvest range this week) isn't what's computed even when rows are present.

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)
- [docs/app-reference/99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) (harvest-window model)

## Recommended fix
On the widened query (per RHO-14), count harvest-window tasks whose window **overlaps** the ISO week:
`due_date <= weekEnd AND (window_end_date IS NULL ? due_date >= weekStart : window_end_date >= weekStart)`,
then **dedupe by plant/instance (or blueprint)**, not task id, to match the "different plants"
semantic. Exclude Completed/Skipped.

## Tests
- Deno test: a pre-week-start harvest window overlapping this week is counted once per plant.

## Risks
- `window_end_date IS NULL` (non-window harvest tasks) → use `due_date` alone. Dedupe key: ad-hoc
  harvest tasks may lack `blueprint_id` → fall back to `inventory_item_ids`/`id`.
