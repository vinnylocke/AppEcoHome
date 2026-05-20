# Wave 4 — Quick Capture Journal

Parent plan: [mobile-quick-access-screen.md](./mobile-quick-access-screen.md) · prev: [Wave 3](./mobile-quick-access-wave-3.md) (shipped)

## Goal

Light up the **Quick Capture** tile in [Quick Access Home](../app-reference/02-dashboard/09-quick-access-home.md). A phone-first capture-first journal mode: snap a photo, jot a note, save. Assign to a specific plant later — from any device — without ever having to remember which plant the note was for at capture time.

```
┌──────────────────────────────────────┐
│  ← Quick           Quick Capture     │
│                                       │
│  ┌──────────────────────────────┐   │
│  │ [Photo dropzone]              │   │
│  │                               │   │
│  │ [tap to camera or library]    │   │
│  │                               │   │
│  └──────────────────────────────┘   │
│                                       │
│  [What did you notice?___________]   │
│                                       │
│  [        Save capture          ]    │
│                                       │
│  ─── Recent captures ──────────────  │
│  📷 "Yellow spots on leaves"        │
│      Captured 12:14 · Assign →       │
│                                       │
│  📷 "Powdery white film"            │
│      Captured Yesterday · Assign →   │
└──────────────────────────────────────┘
```

## Major plan correction — no migration needed

The master plan assumed `plant_journals.inventory_item_id` was `NOT NULL` and that the RLS policy joined through `inventory_items`. **Both assumptions are wrong** (confirmed by reading [supabase/migrations/20260415110152_add_journal_table.sql](../../supabase/migrations/20260415110152_add_journal_table.sql)):

- `inventory_item_id` is `uuid` (nullable since day one) — line 5 of the migration.
- The existing RLS policy `"Users can manage journals for their home"` is `FOR ALL` and gates on **home_id membership**, not on `inventory_item_id`. Unassigned rows are already visible to home members and inserts already work with `inventory_item_id = NULL`.

So Wave 4 is **client-side only**. No SQL, no RLS rewrite, no remote `supabase db push`. Existing data and existing surfaces (Plant Journal Tab inside Instance Edit Modal, which filters `.eq("inventory_item_id", instanceId)`) are untouched — they'll never see unassigned rows because they always pass a specific instance ID.

## App-reference files consulted

- [08-modals-and-overlays/10-plant-journal-tab.md](../app-reference/08-modals-and-overlays/10-plant-journal-tab.md) — existing journal UI inside Instance Edit Modal. Doc says `plant_journal` (singular) but actual table is `plant_journals` (plural — the doc has a stale typo; will fix in this wave's doc update).
- [02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — parent screen; the Quick Capture tile becomes live in this wave.
- [99-cross-cutting/07-data-model-media.md](../app-reference/99-cross-cutting/07-data-model-media.md) — storage buckets + photo conventions.
- [99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md) — existing journal policy already fits the Quick Capture use case.

Source files studied:
- [src/components/PlantJournalTab.tsx](../../src/components/PlantJournalTab.tsx) — current insert + edit + delete flow + PhotoUploader integration.
- [src/components/PhotoUploader.tsx](../../src/components/PhotoUploader.tsx) — bucket-agnostic uploader with `bucket` + `pathPrefix` + `value` + `onChange` props; reused as-is.
- [supabase/migrations/20260415110152_add_journal_table.sql](../../supabase/migrations/20260415110152_add_journal_table.sql) — confirms nullable column + home-scoped RLS.
- [src/components/QuickAccessHome.tsx](../../src/components/QuickAccessHome.tsx) — the Journal tile is currently a `coming-soon` variant; flip to live.

## Decisions

### Decision 1 — No schema change

`plant_journals.inventory_item_id` is already nullable. RLS already supports home-scoped reads/writes of rows without an inventory_item. Zero migration in Wave 4.

(One optional follow-up: a partial index `CREATE INDEX ... ON plant_journals (home_id, created_at DESC) WHERE inventory_item_id IS NULL` to keep the Recent Captures list fast at scale. Not needed for Wave 4 — defer until a home has >100 unassigned entries, which is unlikely.)

### Decision 2 — Subject auto-generated, optionally overridable

`plant_journals.subject` is `NOT NULL`. Quick Capture doesn't ask the user for a subject up front — it auto-generates one like `"Quick capture · 2026-05-20 14:32"` from the capture moment. An inline **Edit title** affordance lets users replace it with their own short label if they want one. Description (free text) is the primary content field.

This keeps capture fast — the whole flow is *snap → type a note → save* without a "what's this called?" friction point.

### Decision 3 — `useUnassignedJournals(homeId)` hook is the data layer

Self-contained data hook in `src/hooks/useUnassignedJournals.ts`:

```ts
export interface UnassignedJournalEntry {
  id: string;
  subject: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

export function useUnassignedJournals(homeId: string | null): {
  entries: UnassignedJournalEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
  assign: (entryId: string, inventoryItemId: string) => Promise<void>;
  remove: (entryId: string) => Promise<void>;
};
```

Query:
```ts
supabase.from("plant_journals")
  .select("id, subject, description, image_url, created_at")
  .eq("home_id", homeId)
  .is("inventory_item_id", null)
  .order("created_at", { ascending: false })
  .limit(100);
```

Existing RLS does the rest of the work. The hook is the single read/write surface — the screen + the assignment sheet both go through it.

### Decision 4 — Recent Captures is unbounded (no auto-archive, no auto-delete)

User-locked decision from the master plan: **"Show all unassigned, no cutoff."** The list is the assignment queue. Users delete what they don't want; nothing falls off automatically.

Practical safeguard: `.limit(100)` in the query so a runaway capture session can't trash the screen. Beyond 100 entries we can add a "Load more" button — defer until anyone hits that wall.

### Decision 5 — Assignment is by inventory_item only (Wave 4 scope)

`plant_journals.inventory_item_id` is the FK that exists today. Assignment writes that column. Future scope (area-level or plan-level journals) could broaden the schema, but Wave 4 stays narrow: pick a plant from your Shed → assign.

The picker reuses the existing `inventory_items` query pattern (homeId-scoped, joined to `plants` for the common name). Renders as a bottom sheet (`AssignToPlantSheet`) — phone-friendly, doesn't navigate away from the captures list.

### Decision 6 — No native vs web split for capture

`PhotoUploader` already handles both Capacitor camera and web `<input type="file" capture="environment">`. Wave 4 reuses it verbatim. No new platform branches.

### Decision 7 — Save behaviour is "save then clear"

After Save: clear the composer (photo + textarea), toast "Saved to your captures", and re-fetch the Recent Captures list. The user stays on the screen ready for the next capture — common pattern for "snap several plants in a session" use case.

### Decision 8 — Desktop UX is the same screen with a banner

Desktop visit to `/quick/journal` renders the same screen with the existing `useIsMobile()`-driven mobile-shortcut banner (same pattern as `/quick/calendar`). Captures + assignments work identically on desktop. The user's locked decision was "assign later from desktop" — this satisfies that without building a separate surface.

## File touch list

| File | Status | Change |
|---|---|---|
| `src/hooks/useUnassignedJournals.ts` | **NEW** | Data hook (entries, loading, refresh, assign, remove). |
| `src/components/quick/QuickCapture.tsx` | **NEW** | The mobile screen at `/quick/journal`. Composer + Recent Captures list. |
| `src/components/quick/AssignToPlantSheet.tsx` | **NEW** | Bottom-sheet plant picker for assigning an unassigned entry. |
| `src/components/QuickAccessHome.tsx` | edit | Quick Capture tile flips from `coming-soon` to live → `navigate("/quick/journal")`. |
| `src/App.tsx` | edit | Add `/quick/journal` route + `quick_journal` to `TAB_URL`. |

No migrations. No edge functions. No RLS changes.

## App-reference work

| File | Action |
|---|---|
| `docs/app-reference/02-dashboard/11-quick-capture-journal.md` | **CREATE** using `_template.md`. New surface. |
| `docs/app-reference/02-dashboard/09-quick-access-home.md` | UPDATE — Quick Capture tile is now live, link to the new file. |
| `docs/app-reference/08-modals-and-overlays/10-plant-journal-tab.md` | UPDATE — fix the stale `plant_journal` → `plant_journals` table name, link to Quick Capture as a sibling surface, document that the tab filters by instance ID so it won't see unassigned rows. |
| `docs/app-reference/99-cross-cutting/07-data-model-media.md` | UPDATE — note that journal entries can be unassigned (no `inventory_item_id`). |
| `docs/app-reference/99-cross-cutting/19-rls-patterns.md` | UPDATE — point at the home-scoped journal policy as the example of "RLS that already supports unassigned rows". |
| `docs/app-reference/99-cross-cutting/21-routing.md` | UPDATE — add `/quick/journal`. |
| `docs/app-reference/00-INDEX.md` | UPDATE — add the new reference. |

## Tests

| Tier | What |
|---|---|
| Vitest | `useUnassignedJournals` — fetch returns unassigned rows; assign updates `inventory_item_id` and removes from local state; remove deletes row + removes from state |
| Vitest | `QuickCapture` — composer reset after save; PhotoUploader hooked correctly; auto-subject generated when blank; submit blocked when description is empty |
| Vitest | `AssignToPlantSheet` — renders shed plants; selecting calls `onAssign(entryId, instanceId)`; cancel closes without writing |
| Playwright | `tests/e2e/specs/quick-journal.spec.ts` — mobile viewport: tap Quick Capture tile on /quick → /quick/journal renders → type a note → Save → entry appears in Recent Captures → click Assign → pick a plant → confirm entry leaves the unassigned list. |

## Data-safety audit

| Change | Risk |
|---|---|
| No DB changes | Zero risk to existing data |
| New hook reads/writes existing table | Goes through the existing RLS policy — same access model as the desktop journal tab |
| Insert with `inventory_item_id = NULL` | Already a permitted insert per the existing schema + RLS |
| Update to set `inventory_item_id` post-capture | Existing `FOR ALL` policy permits this for home members |
| Quick Capture tile flips to live | UI-only; mirrors the Wave 3 Today-tile flip |
| Existing `PlantJournalTab` filters by `inventory_item_id` | It only ever sees the rows it asked for; unassigned rows are invisible to it. No regression. |

## Implementation order

1. **`useUnassignedJournals` hook** + Vitest. Pure data layer, easy to test in isolation.
2. **`AssignToPlantSheet`** + Vitest. Sheet renders shed plants, picking calls `onAssign`.
3. **`QuickCapture` screen** + Vitest. Composer + Recent Captures list, hooked to the hook + sheet.
4. **`App.tsx`** — add `/quick/journal` route + `TAB_URL` entry.
5. **`QuickAccessHome.tsx`** — flip the Quick Capture tile from placeholder to live navigate.
6. **Update `QuickAccessHome.test.ts`** — Quick Capture tile no longer toasts; now navigates.
7. **Playwright spec** for the capture → assign flow.
8. **App-reference docs** — new surface + the six existing-doc updates (incl. the stale `plant_journal` → `plant_journals` typo fix).
9. **Manual test on a phone viewport**:
   - Tap Quick Capture tile → land on `/quick/journal`.
   - Take a photo + write a note → Save → see it in Recent Captures.
   - Take another photo without a description → Save → still works (description optional).
   - Tap Assign on an entry → bottom sheet → pick a plant → entry leaves the list.
   - Switch to desktop browser → `/quick/journal` → banner shows + the captures list is the same → assign from there.
10. **Commit with `[skip ci]`** and `npm run deploy`.

## What this wave doesn't do

- **No edit-in-place** for unassigned entries in Wave 4. Once assigned, the existing Plant Journal Tab handles edit/delete. Pre-assignment, users can only delete (via a trash icon). Edit can come later if anyone misses it.
- **No area- or plan-level journaling** — `inventory_item_id` only.
- **No dashboard surfacing** of unassigned-count ("5 captures waiting"). The Recent Captures list itself is the discovery surface.
- **No realtime subscription** on the Quick Capture screen. The user is the only one writing on this surface 99% of the time; refresh-on-save covers the common case.

## Locked decisions (from master plan + Wave 4 calls)

| Question | Decision |
|---|---|
| Retention of unassigned entries | Show all unassigned, no cutoff (master plan) |
| Subject field | Auto-generated `"Quick capture · {YYYY-MM-DD HH:mm}"`; editable inline if user wants a custom title |
| Schema change required? | **No** — column is already nullable, RLS already supports it |
| Assignment scope | Plant instance only (`inventory_item_id`); area/plan deferred |
| Desktop visit to `/quick/journal` | Same screen with the existing mobile-shortcut banner |
| Description required? | No — quick photos with no note are fine |

## Locked decisions (final pass before implementation)

| Question | Decision |
|---|---|
| Save validation | **Either a photo OR a description** required (the Save button is enabled when at least one is present). Supports the one-tap "snap and save" moment AND the "jot a note while watering" moment. |
| Auto-subject format | **Human-readable**: `"Capture · 20 May, 14:32"`. Generated via `toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })`. Editable inline via an Edit-title affordance. |
