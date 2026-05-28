# Global Journal + Plant End-of-Life

## Goal

Two connected features. The journal feature comes first because the end-of-life analysis depends on rich journal data to be useful.

### Feature A — Global Journal

Today: every journal entry is scoped to a single plant instance (`plant_journals.inventory_item_id`). There's already a Quick Capture screen for unassigned entries, but no global feed.

Want: one top-level journal page showing every entry across the home. Entries can be assigned to any of:

- **Plant instance** — still appears in that plant's existing Journal tab.
- **Location**
- **Area**
- **Plan**
- **Unassigned** — a true "general garden note".

Plus an **"Auto-update journal"** user setting — when on, completing a Planting / Harvesting / Pruning task auto-creates a journal entry referencing that task.

### Feature B — Plant End-of-Life

Today: archiving a plant instance is a clinical `is_archived = true` flip. No record of why, no closure, no learning.

Want: a friendlier "Lifecycle complete" flow on plant instances. The user marks an instance as ended, optionally ticks "this was natural end of life" (annuals reaching season-end, harvest complete, etc.). If **unticked**, Gemini runs an analysis using everything we know (journal, tasks, ailments, area, weather) and produces a "what likely went wrong + how to prevent next time" summary, saved as the final journal entry on that instance.

The wording matters: gardeners feel guilt when plants die. Copy is warm, not clinical.

## App-reference files consulted

- [`docs/app-reference/08-modals-and-overlays/10-plant-journal-tab.md`](docs/app-reference/08-modals-and-overlays/10-plant-journal-tab.md) — existing per-instance journal tab
- [`docs/app-reference/02-dashboard/11-quick-capture-journal.md`](docs/app-reference/02-dashboard/11-quick-capture-journal.md) — existing unassigned-entry flow
- [`docs/app-reference/99-cross-cutting/03-data-model-plants.md`](docs/app-reference/99-cross-cutting/03-data-model-plants.md) — plant + instance schema (to be updated)
- [`docs/app-reference/99-cross-cutting/04-data-model-tasks.md`](docs/app-reference/99-cross-cutting/04-data-model-tasks.md) — task completion hook point
- [`docs/app-reference/99-cross-cutting/13-ai-gemini.md`](docs/app-reference/99-cross-cutting/13-ai-gemini.md) — for the end-of-life analysis edge function

## Investigation summary

- `plant_journals` already has: `id`, `home_id`, `inventory_item_id` (nullable), `task_id` (nullable, FK to `tasks`), `subject`, `description`, `image_url`, `created_at`. Half the polymorphic shape is already in place.
- `inventory_items.status` lifecycle uses string values like `"Planted"`, `"Unplanted"`. Adding `"Ended"` slots naturally alongside, with `ended_at`, `ended_reason`, `was_natural_end` columns.
- `task_categories.ts` defines: Planting, Watering, Harvesting, Maintenance, Pruning. **No "Sowing" category** — sowing is treated as Planting throughout the app. The auto-journal trigger uses `category ∈ {Planting, Harvesting, Pruning}` directly; sowing entries naturally become Planting entries.
- `user_profiles` already holds preferences like `notification_interval_hours` and `ai_enabled` — adding `auto_update_journal boolean` fits.

## Sensible-default decisions

| Decision | Choice |
|---|---|
| Polymorphic strategy | **Nullable FKs (single-target).** Add `location_id`, `area_id`, `plan_id` to `plant_journals` alongside the existing `inventory_item_id`, with a CHECK constraint that at most one is set. Simpler than a join table, queries stay cheap, indexes are obvious. Multi-tag can be added in a future migration without breaking v1. |
| Auto-update scope | **User-scoped** (`user_profiles.auto_update_journal`). Each member of a shared home decides independently — one user enables it, another keeps the journal manual. |
| Auto-update categories | **User-selectable per category.** Stored as `text[]` of category names on `user_profiles`. Settings UI renders a checkbox per entry in `TASK_CATEGORIES` so adding a new category later (e.g. "Sowing") automatically appears in the picker — no schema change, no UI churn. Empty array = auto-update off. Default = empty (off). |
| Auto-update entry shape | `subject` = "Planted · {plant name}" / "Harvested · {plant name}" / "Pruned · {plant name}"; `description` = task title + completion timestamp; `task_id` filled; `inventory_item_id` filled if the task is tied to one. |
| "End of life" wording | **"Lifecycle complete"** as the verb; **"Ended"** as the status. The button on the instance modal reads "Mark lifecycle complete". The final modal is "{Plant name}'s journey". The natural-end-of-life option reads "This plant reached the end of its natural life" with a sub-explanation "(e.g. annual finished its season, harvest complete, season-end)". |
| Default for "natural end of life" tick | **Unticked.** Makes the analysis the default path — if it really was natural, the user explicitly says so. |
| End-of-life analysis tier gate | **AI-enabled tiers only** (`ai_enabled = true`). Non-AI tiers see the lifecycle-complete flow but the analysis section is replaced with a "Upgrade to get AI insights" card. |
| End-of-life analysis output storage | Saved as the **final journal entry** on the instance, with `subject = "Lifecycle analysis"` and `description = <gemini output>`. Persists even after archival. |
| Multi-target entries | **Defer.** Single-target keeps v1 small. The user can write the same observation twice if they really need it on two surfaces. |
| Existing per-instance Journal tab | **Keep, but read from the same table.** The tab continues to filter `inventory_item_id = X` and shows any entry tied to that instance regardless of how it was created. |
| Realtime sync | **Use the existing realtime channel.** Already in place for `plant_journals`; new entries (including auto-created ones) propagate without extra wiring. |

## Architecture

### Schema changes

```sql
-- Migration: add polymorphic assignment to plant_journals
alter table plant_journals
  add column location_id uuid references locations(id) on delete set null,
  add column area_id     uuid references areas(id)     on delete set null,
  add column plan_id     uuid references plans(id)     on delete set null,
  add constraint plant_journals_single_target check (
    (case when inventory_item_id is not null then 1 else 0 end)
  + (case when location_id       is not null then 1 else 0 end)
  + (case when area_id           is not null then 1 else 0 end)
  + (case when plan_id           is not null then 1 else 0 end)
    <= 1
  );

create index plant_journals_location_id_idx on plant_journals(location_id) where location_id is not null;
create index plant_journals_area_id_idx     on plant_journals(area_id)     where area_id     is not null;
create index plant_journals_plan_id_idx     on plant_journals(plan_id)     where plan_id     is not null;
create index plant_journals_created_at_idx  on plant_journals(home_id, created_at desc);

-- Migration: end-of-life on plant instances
alter table inventory_items
  add column ended_at        timestamptz,
  add column was_natural_end boolean,
  add column end_summary     text;  -- short user note captured at lifecycle-complete time

-- Migration: auto-update preference (per-category list)
alter table user_profiles
  add column auto_update_journal_categories text[] not null default array[]::text[];
```

`inventory_items.status` does not change; setting `ended_at` puts the instance into the new "ended" view. (Avoids breaking existing status-based queries.)

### New surface — Global Journal (`/journal`)

| Element | Purpose |
|---|---|
| Header | "Garden Journal" + entry count + "New entry" button |
| Composer (expandable) | Textarea + photo + target picker (radio: Plant / Location / Area / Plan / Unassigned, then a sub-dropdown for the chosen target) |
| Filter chips | "All · Unassigned · Plants · Locations · Areas · Plans" |
| Entry feed | Newest first, grouped by date headers ("Today", "Yesterday", "Last week", "Earlier") |
| Per-entry card | Subject · description snippet · target chip (linked) · photo thumb · auto-generated badge if `task_id IS NOT NULL` |
| Settings link | "Auto-update journal: ON / OFF" toggle visible in header — also exposed on `/profile` for canonical control |

### Per-instance Journal Tab — backward compatible

Already reads from `plant_journals` filtered by `inventory_item_id`. No change to its query; auto-created entries automatically appear there because the auto-create handler sets `inventory_item_id` when the task has one.

### Auto-update hook point

Hook into the existing task-completion path (`TaskList.tsx` + offline queue completion). When a task is marked complete:

1. Read `user_profiles.auto_update_journal_categories`.
2. If the task's category is in that array, insert a `plant_journals` row with `task_id` set, `inventory_item_id` set (if the task is plant-scoped), and the formatted subject/description above.
3. Idempotent on `task_id` — same task completed twice (uncompleted then completed) does not duplicate journal entries. Enforced via `unique (task_id) where task_id is not null`.

### End-of-life flow

**Trigger:** "Mark lifecycle complete" button in `InstanceEditModal`, replacing the current archive button.

**Modal** ("Mark {plant name}'s lifecycle complete"):

1. **Optional photo** — final-state photo for the closing memento.
2. **Optional note** — "Anything to remember about this plant?" textarea (becomes `end_summary`).
3. **Checkbox** — "This plant reached the end of its natural life" (default OFF; sub-text explains).
4. **Confirm** — sets `inventory_items.ended_at = now()`, `was_natural_end = checkbox`, `end_summary = note`.

**After confirm:**

- **If natural end** — show a brief "Thanks for tending {plant name}" confirmation modal with the final photo. No analysis runs. Journal gets a closing entry: subject "Lifecycle complete (natural)".
- **If not natural** AND user has `ai_enabled = true` — invoke a new edge function `analyse-plant-end-of-life`. Show a loading-state modal "Looking back over {plant name}'s time with us…". On return, render the analysis as a card: "What likely happened" / "What to try next time". Save the analysis as a `plant_journals` row with subject "Lifecycle analysis".
- **If not natural** AND `ai_enabled = false` — show an upgrade card. Journal still gets a closing entry: subject "Lifecycle complete".

### Edge function: `analyse-plant-end-of-life`

| Aspect | Detail |
|---|---|
| Auth | `requireAuth` + `guardAiByHome` |
| Input | `{ instance_id: uuid }` |
| Server-side gather | plant species + cultivar, area (lux/pH/soil/water-movement), location postcode, all journal entries for instance, all completed/missed/postponed tasks for instance, linked ailments, last 30 days of weather snapshots for the area's location, `end_summary` if set, days alive |
| Gemini prompt | Structured: "You are a gardening expert helping a {persona} gardener understand what happened. Be warm, specific, non-judgemental." + the gathered data. Asked for: `likely_causes: string[]`, `prevention_next_time: string[]`, `affirmation: string` (one sentence acknowledging the user's effort). |
| Output | JSON `{ likely_causes, prevention_next_time, affirmation }` — saved verbatim as the journal entry description; rendered in the post-flow modal. |
| Cost | One call per lifecycle end. Audit row written via the existing AI usage logging. |

### Tier gating

| Tier | Behaviour |
|---|---|
| Sprout | Global journal full access. Auto-update setting visible. End-of-life flow visible but analysis card is replaced with "Upgrade for AI insights". |
| Botanist | Same as Sprout (no AI). |
| Sage / Evergreen | Full feature including end-of-life analysis. |

## Files

### New

| File | Purpose |
|---|---|
| `supabase/migrations/YYYYMMDD_global_journal_targets.sql` | Polymorphic FKs + CHECK + indexes on `plant_journals` |
| `supabase/migrations/YYYYMMDD_plant_lifecycle_end.sql` | `inventory_items.ended_at / was_natural_end / end_summary` columns |
| `supabase/migrations/YYYYMMDD_auto_update_journal_pref.sql` | `user_profiles.auto_update_journal` |
| `src/components/GlobalJournal.tsx` | New `/journal` route entry component |
| `src/components/journal/JournalComposer.tsx` | Shared textarea + photo + target picker |
| `src/components/journal/JournalEntryCard.tsx` | Reusable entry row, used by GlobalJournal + per-instance tab |
| `src/components/journal/TargetPicker.tsx` | Plant/Location/Area/Plan selector |
| `src/components/LifecycleCompleteModal.tsx` | The "Mark lifecycle complete" modal |
| `src/components/LifecycleAnalysisModal.tsx` | The post-analysis result modal |
| `src/hooks/useGlobalJournal.ts` | Query + mutation hook (replaces direct supabase calls) |
| `src/services/journalAutoUpdateService.ts` | Pure helper used at task-completion sites to write the auto-entry |
| `supabase/functions/analyse-plant-end-of-life/index.ts` | Gemini-backed analysis function |
| `supabase/functions/analyse-plant-end-of-life/prompt.ts` | Prompt builder (testable) |
| `supabase/tests/analyse-plant-end-of-life.test.ts` | Deno tests for the prompt builder |
| `tests/unit/services/journalAutoUpdateService.test.ts` | Vitest unit tests |
| `tests/unit/components/journal/TargetPicker.test.ts` | Vitest tests for target validation |
| `docs/app-reference/04-garden/05-global-journal.md` | New Role 1 + Role 2 reference (using `_template.md`) |
| `docs/app-reference/08-modals-and-overlays/XX-lifecycle-complete.md` | New reference for the end-of-life modal |

### Modified

| File | Change |
|---|---|
| `src/App.tsx` | Add `/journal` route + nav entry |
| `src/components/PlantJournalTab.tsx` | Switch to `useGlobalJournal` hook (still filtered by instance) — preserves existing UX |
| `src/components/quick/QuickCapture.tsx` | Use shared `JournalComposer` |
| `src/components/InstanceEditModal.tsx` | Replace archive CTA with "Mark lifecycle complete"; on ended instances, show a read-only "Lifecycle complete" badge |
| `src/components/TaskList.tsx` (and any other task-complete sites) | Call `journalAutoUpdateService.maybeCreateEntry(task)` after successful completion |
| `src/components/GardenerProfile.tsx` (Account tab) | Add Auto-update journal toggle |
| `src/types.ts` | Extend `UserProfile` with `auto_update_journal`; add `JournalEntry` shape with new FKs; extend instance type with end-of-life fields |
| `docs/app-reference/08-modals-and-overlays/10-plant-journal-tab.md` | Update to note shared backing + auto-created entries |
| `docs/app-reference/02-dashboard/11-quick-capture-journal.md` | Update to note shared composer + global journal as new home |
| `docs/app-reference/99-cross-cutting/03-data-model-plants.md` | Document the new lifecycle-end columns |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Add `analyse-plant-end-of-life` |
| `docs/app-reference/99-cross-cutting/00-INDEX.md` or the master `00-INDEX.md` | Add the two new reference files |

## Steps (sequenced)

1. **Migrations local** — three new migrations, `supabase migration up` locally, verify with `\d plant_journals` / `\d inventory_items` / `\d user_profiles`.
2. **Types** — extend `src/types.ts` to match the new schema.
3. **`useGlobalJournal` hook + `journalAutoUpdateService`** — the data layer that both new and existing surfaces share.
4. **Refactor `PlantJournalTab.tsx`** — point at the new hook; verify per-instance behaviour unchanged.
5. **Refactor `QuickCapture.tsx`** — point at the new hook + shared composer.
6. **Build `GlobalJournal.tsx`** + composer + target picker + entry card.
7. **Wire `/journal` route** in `App.tsx` + add nav entry.
8. **Add `auto_update_journal` toggle** to Gardener Profile.
9. **Hook into task completion** — call `journalAutoUpdateService.maybeCreateEntry(task)` everywhere completion happens. Idempotent on `task_id`.
10. **Build `LifecycleCompleteModal.tsx`** + wire into `InstanceEditModal.tsx`. Update archive button to be the new CTA.
11. **Edge function** `analyse-plant-end-of-life` — gather data, call Gemini, save analysis journal entry, return result.
12. **Build `LifecycleAnalysisModal.tsx`** — post-flow result presentation.
13. **Tests** — Vitest for service + composer + target picker; Deno for the prompt builder.
14. **App-reference docs** — write the two new files; update the four touched cross-cutting / overlay docs.
15. **`supabase db push`** (only on user confirmation) + typecheck + tests + deploy.

## Decisions to confirm before implementation

1. **Lifecycle-complete wording** — happy with **"Mark lifecycle complete"** as the verb and **"Lifecycle complete"** as the status label? (Open to alternatives: "Mark journey complete", "End plant lifecycle", "Final entry".)
2. **Natural end of life default** — confirm checkbox should default to **unticked** (analysis is the default).
3. **Single-target polymorphism** — confirm we're going with **nullable FKs + CHECK constraint (at most one target)** for v1, not a join table.
4. **Auto-update categories** — confirm **Planting / Harvesting / Pruning** (excludes Watering + Maintenance for noise reasons).
5. **End-of-life analysis tier-gate** — confirm restricting Gemini analysis to **AI-enabled tiers** (Sage / Evergreen + `ai_enabled = true`).

Once those five are confirmed, implementation can begin in the order above.
