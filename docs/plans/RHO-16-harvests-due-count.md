# RHO-16 — "Garden This Week → Harvests Due" always 0 despite active harvest windows

**Jira:** RHO-16 · Bug · Medium. **Depends on the widened query from [RHO-14](RHO-14-tasks-this-week-counts.md); day-strip is [RHO-15](RHO-15-week-overview-counts.md).**

## Problem
"Garden This Week → Harvests Due" shows 0 even when harvest ranges cover part of the current week.

## Root cause
`harvestBlueprintsDue` is derived from the week-bounded task set —
[home-dashboard-stats/index.ts:236-241](../../supabase/functions/home-dashboard-stats/index.ts#L236-L241):
```ts
const harvestTasks = tasks.filter(t => ["Harvesting","Harvest"].includes(t.type) && t.status !== "Skipped");
const harvestBlueprintsDue = new Set(harvestTasks.map(t => t.id)).size; // dedupe by task id
```
Two defects:
1. The source `tasks` is **`due_date`-in-week only** ([:60-65](../../supabase/functions/home-dashboard-stats/index.ts#L60-L65)),
   so a harvest window whose start (`due_date`) is before `weekStart` — the exact "range covering
   half the week" case — is excluded → count 0. (Wave-20 harvest windows emit **one** task spanning
   `due_date..window_end_date`; see [04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) §"Harvest window-task semantics".)
2. It dedupes by `t.id`, which isn't the "different plants" the ticket asks for.

## The unlinked-harvest problem (raised in triage review)
Harvest tasks link plants via **`tasks.inventory_item_ids` (`uuid[]`, multi-link)** — but a harvest
task can also be **area/location-scoped or fully unlinked** (no `inventory_item_ids`). The seed's
harvest tasks pass `{ inv: someInv[n]?.id }`, which is `undefined` when the inventory array is short —
so even seeded data can produce plant-less harvest tasks, and real ad-hoc harvests often have none.
So the count **cannot** simply dedupe by plant — it must handle no-plant harvests.

Also note: the stats query **doesn't currently fetch `inventory_item_ids` or `blueprint_id` at all**
([select at :62](../../supabase/functions/home-dashboard-stats/index.ts#L62)), so those columns must
be added to the select before any plant-aware counting is possible.

## Decision (confirmed with product)
**"Harvests Due" = distinct plants + each unlinked harvest counts as 1.** A harvest task covering
multiple plants counts once per distinct plant; a harvest with no plant link still counts (as one).

## Recommended fix
1. **Widen the query** (shared with RHO-14) so pre-week-start windows load, and **add
   `inventory_item_ids, blueprint_id`** to the [select](../../supabase/functions/home-dashboard-stats/index.ts#L62).
2. **In-week harvest set:** type ∈ {Harvesting, Harvest}, status ∉ {Completed, Skipped}, and window
   **overlaps** the ISO week:
   `due_date <= weekEnd AND (window_end_date IS NULL ? due_date >= weekStart : window_end_date >= weekStart)`.
3. **Count by subject** into a `Set<string>`:
   ```ts
   const key = new Set<string>();
   for (const t of inWeekHarvests) {
     if (t.inventory_item_ids?.length) {
       for (const id of t.inventory_item_ids) key.add(`plant:${id}`);   // distinct plants
     } else {
       key.add(`harvest:${t.blueprint_id ?? t.id}`);                    // unlinked → 1 (recurring deduped by blueprint)
     }
   }
   const harvestsDue = key.size;
   ```
4. **Companion count:** apply the same subject-keyed dedup to `harvestBlueprintsCompleted`
   ([:242-244](../../supabase/functions/home-dashboard-stats/index.ts#L242-L244)) so "done" and "due"
   are counted on the same basis (currently a raw `.length`).

## App-reference consulted
- [docs/app-reference/99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) (harvest window model + `inventory_item_ids` multi-link)
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)

## Tests
Deno tests for `home-dashboard-stats` covering: (a) a pre-week-start window overlapping this week
counts; (b) a task with 3 `inventory_item_ids` counts as 3; (c) the **same plant** in two harvest
tasks/windows counts once; (d) an **unlinked** (no `inventory_item_ids`) harvest counts as 1;
(e) a recurring unlinked harvest (same `blueprint_id`, two instances) counts once; (f) Completed/Skipped excluded.

## Risks / edge cases
- `inventory_item_ids` may be `null` vs `[]` — treat both as unlinked.
- A plant referenced by both a linked and an unlinked task is still deduped correctly (plant key vs harvest key never collide by prefix).
- Ghosts: the function doesn't materialise ghosts; persisted Wave-20 harvest tasks carry `window_end_date`, so the widened query catches them. If harvest **blueprints** without a persisted row must count, that's a larger change — out of scope unless the seed/real data shows it's needed.
