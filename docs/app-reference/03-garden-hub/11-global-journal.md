# Global Journal

> One canonical surface for every journal entry across the home — from per-plant observations to whole-garden notes — with optional automatic entries on task completion.

**Route / how to reach it:** `/journal` · top-level nav item "Journal" (BookOpen icon, `plan` group) on desktop + mobile drawer. Since the Phase 5 IA pass this route mounts `JournalNotesHub`, a tabbed hub that renders **Global Journal** under its default **Journal** tab and **Notes** under the **Notes** tab. `/journal` (no query param) lands on Journal; the sibling Notes surface is `/journal?tab=notes`. The single "Journal" nav item now covers both (`matchPaths: ["/journal","/notes"]`).
**Source files (entry points):**
- `src/components/JournalNotesHub.tsx` (route wrapper — SegmentedTabs switch that mounts this surface)
- `src/components/GlobalJournal.tsx`
- `src/components/journal/JournalComposer.tsx`
- `src/components/journal/TargetPicker.tsx`
- `src/components/journal/JournalEntryCard.tsx`
- `src/hooks/useGlobalJournal.ts`
- `src/services/journalAutoUpdateService.ts`

---

## Quick Summary

The Global Journal is the home for everything a user writes about their garden. Every entry can be attached to **at most one** of: a plant instance, a location, an area, a plan — or stay unassigned as a general garden note. Entries assigned to a plant instance still appear in that plant's existing Journal tab (the data backs both surfaces from the same `plant_journals` table). An optional per-category preference (`auto_update_journal_categories`) auto-creates entries when the user completes Planting / Harvesting / Pruning / Watering / Maintenance tasks — modular so future task categories appear in the setting picker without a schema change.

---

## Role 1 — Technical Reference

### Component graph

```
JournalNotesHub (mounted at /journal — the route-level wrapper)
├── SegmentedTabs (testid="journal-notes-switch": "Journal" / "Notes")
├── GlobalJournal   ← rendered when tab === "journal" (this surface)
└── NotesPage       ← rendered when tab === "notes" (see 14-notes.md)

GlobalJournal (Journal tab of the hub)
├── Header (title + count + "New entry" + settings shortcut)
├── JournalComposer  (collapsible — opens on "New entry")
│   ├── Subject input
│   ├── Description textarea
│   ├── TargetPicker (Plant / Location / Area / Plan / Unassigned + sub-dropdown)
│   ├── PhotoUploader (bucket="plant-images", pathPrefix="journal/{homeId}")
│   └── Save button
├── Filter chip strip (All / Plants / Locations / Areas / Plans / Unassigned, with counts)
├── Entry feed (grouped by Today / Yesterday / Last week / Earlier)
│   └── JournalEntryCard ×n
│       ├── Photo thumb (if attached)
│       ├── Subject + description snippet
│       ├── Target chip (links to the assigned surface)
│       ├── "Auto" pill when task_id IS NOT NULL
│       └── Delete button
└── ConfirmModal (delete-entry safety)
```

**Journal/Notes hub — UI-only merge.** `JournalNotesHub` reads the active tab from the `tab` URL query param (`params.get("tab") === "notes" ? "notes" : "journal"`) and swaps the mounted child; switching tabs calls `setSearchParams(..., { replace: true })` — Journal is the default and clears the param (no `?tab=journal`), Notes sets `?tab=notes`. The legacy standalone `/notes` route is a `<Navigate to="/journal?tab=notes" replace />` redirect in `src/App.tsx`, and the old standalone "Notes" primary-nav item was removed (the `journal` nav item's `matchPaths` now covers both). **This is purely a UI/navigation merge — there is no data migration.** GlobalJournal still reads/writes `plant_journals` exactly as before, NotesPage still reads/writes `notes` + `note_links`; neither table, query, composer, toolbar, nor any child testid changed.

### Data flow — read paths

`useGlobalJournal(homeId)` issues one query at mount:

```ts
supabase
  .from("plant_journals")
  .select("id, home_id, subject, description, image_url, created_at, inventory_item_id, location_id, area_id, plan_id, task_id")
  .eq("home_id", homeId)
  .order("created_at", { ascending: false })
  .limit(200);
```

After the entries load, `GlobalJournal.tsx` runs four parallel batched lookups (`inventory_items`, `locations`, `areas`, `plans`) for `id IN (...)` to populate the target-label map shown on each entry chip.

Filter chips operate **client-side** — the full set is in memory, switching chips is instant. No re-fetch.

### Data flow — write paths

| Action | DB |
|--------|----|
| Manual entry create | `plant_journals.insert(...)` via `useGlobalJournal.create()` |
| Entry edit | `plant_journals.update(patch)` via `useGlobalJournal.update()` |
| Entry delete | `plant_journals.delete()` via `useGlobalJournal.remove()` |
| Auto-create on task complete | `plant_journals.insert(...)` via `journalAutoUpdateService.maybeCreateAutoEntry()` (no-op when category not in user prefs) |

The polymorphic target column is enforced by a CHECK constraint — at most ONE of `inventory_item_id`, `location_id`, `area_id`, `plan_id` may be set. The DB rejects invalid combinations.

A second invariant: `unique (task_id) where task_id is not null`. The auto-update service treats `23505` unique-violation as a no-op so re-completing a task does NOT create a duplicate entry.

### Edge functions invoked

None directly. The end-of-life flow (a different surface) invokes `analyse-plant-end-of-life` and saves its output as a `plant_journals` row that surfaces here.

### Cron / scheduled jobs

None.

### Realtime channels

`plant_journals` is published on the existing home realtime channel. Inserts from other devices / members arrive automatically — no manual refresh.

### Tier gating

None. Available on every tier. (The end-of-life *analysis* feature IS tier-gated; the journal itself is universal.)

### Beta gating

None.

### Permissions

The existing `plant_journals` RLS policy (home-scope via `home_members` / `user_profiles.home_id`) gates all reads and writes. No additional permission checks at the component level.

### Error states

| State | Result |
|-------|--------|
| Network failure on load | Inline red banner with the supabase error message; refresh button hidden — user retries by navigating back. |
| Save validation (missing subject) | Toast + red field outline + ARIA live region announcement. |
| Save validation (target type chosen but no id picked) | Toast "Pick a {type} to attach to." |
| Delete failure | Confirm modal stays open so the user can retry. |
| CHECK constraint violation | Should never happen client-side — composer enforces single-target. Logged via Sentry if it does. |

### Performance

- Hard limit of 200 entries returned per fetch. Pagination is deliberately not implemented in v1.
- Target-label lookups batch all ids per type into one `in()` query each — at most 4 round-trips.
- Filter is purely client-side; no re-query on chip switch.
- `JournalComposer` is collapsible — not rendered until user opens it. Saves the PhotoUploader from mounting eagerly.

### Linked storage buckets

- `plant-images` bucket, path prefix `journal/{homeId}` and `journal/{homeId}/lifecycle` (the lifecycle-complete photo).

---

## Role 2 — Expert Gardener's Guide

### Why open this page

Gardens are made of small notable moments — "the courgettes finally took off", "spotted aphids on the cherry", "the south bed dries out by lunchtime in July". Until now those notes lived inside individual plants and got lost. The Global Journal pulls every note into one feed so the garden's whole story is in one place — readable end-to-end, filterable by what you care about.

**Journal and Notes now share one screen.** Open **Journal** from the nav and you land on a page with a tab switch at the top — **Journal** (this event-anchored feed: "watered today", "harvested 200g") and **Notes** (looser, rich-text ideas and reminders). They're two tabs of the same "write things down" home; tap the switch to move between them. The old separate Notes menu item is gone — everything lives here now. Nothing about your existing entries or notes changed; only where you reach them did.

### Every flow on this page

#### 1. Write a manual entry

- Tap **New entry**.
- Type a subject (required) and an optional description.
- Choose what it's about:
  - **Plant** → the entry appears here AND in that plant's Journal tab.
  - **Location** → the entry shows on the global feed with a Location chip.
  - **Area** → same idea, scoped to a smaller patch.
  - **Plan** → ties it to one of your garden plans.
  - **Unassigned** → a general garden note, lives only on the global feed.
- (Optional) attach a photo.
- Save.

#### 2. Filter the feed

- Chip strip across the top: All / Plants / Locations / Areas / Plans / Unassigned, each with a count.
- Tap a chip to filter instantly. No reload — the feed re-groups by date in place.

#### 3. Open the linked target

- Every entry card has a chip showing what it's attached to. Tap the chip to jump to the plant in the Shed, the location/area in Management, or the plan in the Planner.
- Unassigned entries show a calm grey "Unassigned" chip — no link.

#### 4. Delete an entry

- Trash icon on each card → confirm modal → gone.
- Auto-created entries (from task completions) can be deleted exactly the same way. They won't reappear unless you re-complete the same task — and even then the DB invariant prevents duplicates.

#### 5. Auto-update journal (the quiet helper)

- Open **Gardener Profile → Account → Auto-update journal**.
- Tick the task categories you want to flow through automatically. Common choice: Planting + Harvesting + Pruning (the milestones). Power users may add Watering + Maintenance for a complete history.
- From then on, every time you complete a task in a ticked category, a journal entry quietly appears with subject like "Planted · Tomato" or "Harvested · 3 plants", description carrying the task title.
- Multi-plant tasks (e.g. "water tomato + basil + pepper") produce one entry referencing all the plants — the Unassigned chip will be set, but the entry surfaces in the global feed.

### Information on display — what every field means

| Element | Meaning |
|---|---|
| Subject | The headline. Keep it short — the rest goes in the description. |
| Description | Free-text. Multi-line. Auto-created entries put the task title here. |
| Target chip | Where the entry "lives". A plant, location, area, plan, or Unassigned. |
| Photo | Optional. Uploaded to your home's plant-images bucket. |
| Timestamp | "2 hours ago", "Yesterday" — relative time. Hover the card for the exact date. |
| "Auto" pill (amber) | This entry was created automatically when you completed a task. |

### Tier-by-tier experience

The journal is identical for every tier. Tier-gating only affects the lifecycle-complete analysis (a separate flow); writing, reading, and auto-updating entries is universal.

### Common mistakes / pitfalls

- **Forgetting to pick a target.** If you select a target type but don't pick a sub-item, save will fail. The composer toasts a reminder; just pick or switch to Unassigned.
- **Multi-plant auto-entries land as Unassigned.** This is deliberate — a single entry can't attach to multiple plants. If you want per-plant journal entries, complete one plant's task at a time.
- **Deleting an entry is permanent.** No soft-delete in v1. Be sure before you tap the confirm.

### Recommended workflows

- **Morning audit:** open `/journal`, filter to Plants, scroll the last 7 days. You'll see what you've noticed about each plant in the past week without opening any of them individually.
- **End-of-day capture:** new entry, target = Unassigned, jot what you saw. Tag plants later when you've got more time on a desktop.
- **Seasonal review:** filter to Plans + look at the Earlier group at the bottom of the feed for the long view.

### What to do if something looks wrong

- **Entries missing that I know I wrote:** the global feed is capped at 200 newest. Older entries are still in the DB and visible on the relevant plant/location/area/plan surface — pagination is on the roadmap.
- **Auto-update created an entry I didn't want:** delete the entry, then untick the relevant category in Gardener Profile so it doesn't happen again.
- **Photo wouldn't upload:** check your network. Compressed copies live in the plant-images bucket; if the upload widget hangs, refresh and try again.

---

## Related reference files

- [Notes](./14-notes.md) — the sibling tab of the shared `/journal` hub (`/journal?tab=notes`); rich-text notebook backed by its own `notes` + `note_links` tables
- [Plant Journal Tab](../08-modals-and-overlays/10-plant-journal-tab.md) — the per-instance lens onto the same data
- [Quick Capture Journal](../02-dashboard/11-quick-capture-journal.md) — mobile-first capture-then-assign companion
- [Lifecycle Complete Modal](../08-modals-and-overlays/24-lifecycle-complete.md) — writes a closing journal entry on every end-of-life
- [Routing](../99-cross-cutting/21-routing.md) — `/journal`, the `?tab=notes` param, and the `/notes → /journal?tab=notes` redirect
- [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md) — instance schema (`ended_at`, `was_natural_end`, `end_summary`)
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md) — the analysis call chain
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `analyse-plant-end-of-life`

## Code references for ongoing maintenance

- `src/components/JournalNotesHub.tsx` — `/journal` route wrapper; SegmentedTabs switch (`journal-notes-switch`) that mounts GlobalJournal (Journal tab) or NotesPage (Notes tab) off the `?tab` query param
- `src/App.tsx` — `/journal` route, the `/notes → /journal?tab=notes` `<Navigate>` redirect, and the single `journal` nav item (`matchPaths: ["/journal","/notes"]`)
- `src/components/GlobalJournal.tsx` — entry component
- `src/components/journal/TargetPicker.tsx` — polymorphic target selector + payload helper
- `src/components/journal/JournalComposer.tsx` — shared composer used by global + (optionally) per-instance
- `src/components/journal/JournalEntryCard.tsx` — reusable card
- `src/hooks/useGlobalJournal.ts` — data hook (`create / update / remove`) + `getEntryTargetType`
- `src/services/journalAutoUpdateService.ts` — task-completion bridge
- `src/components/JournalAutoUpdateSetting.tsx` — Gardener Profile toggle list
- `supabase/migrations/20260626000000_global_journal_targets.sql` — polymorphic FKs + CHECK + unique `task_id`
- `supabase/migrations/20260626000200_auto_update_journal_pref.sql` — `user_profiles.auto_update_journal_categories text[]`
