# Garden Layout List

> The landing page of the Garden Layout tab. Lists every saved layout for this home and offers three creation flows: Blank Canvas, Garden Builder wizard, and Starter Layout templates.

**Route:** `/garden-layout`
**Source file:** `src/components/GardenLayoutList.tsx`

---

## Quick Summary

A scrollable list of `garden_layouts` for this home. Each row shows the layout name, canvas dimensions in metres, and four actions: open, rename, duplicate, delete. The Plus button in the header opens a three-option wizard:

- **Blank Canvas** — minimal: just a layout name, lands in empty editor
- **Garden Builder** — 3-step wizard: name & shape → size → per-edge border styles (fence/hedge/wall)
- **Starter Layout** — picks from 3 pre-baked templates (Allotment Plot, Front Border, Container Terrace) that seed both the layout and an opinionated set of shapes

---

## Role 1 — Technical Reference

### Component graph

```
GardenLayoutList
├── Header (title + Plus button)
├── Layout list
│   ├── Loading spinner (initial fetch)
│   ├── Empty state (no layouts)
│   └── Layout cards (one per row)
│       ├── Icon + name + dimensions
│       ├── Rename inline editor (when active)
│       ├── Rename button
│       ├── Duplicate button
│       ├── Delete button
│       └── Open chevron
└── Wizard modal (when wizardMode !== null)
    ├── Choice screen — 3 options
    ├── Blank canvas (name → create)
    ├── Starter (pick template → create with shapes)
    └── Builder (3-step wizard)
        ├── Step 1: name + shape (rect/square/L/T/trapezoid)
        ├── Step 2: width + length + preview SVG
        └── Step 3: interactive edge selector with border style chips
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx route prop | Scope all reads/writes |

### Local state

| State | Purpose |
|-------|---------|
| `layouts` | List of `garden_layouts` rows |
| `loading` | Initial fetch in flight |
| `creating` | Insert in flight (any wizard) |
| `renamingId` / `renameValue` | Inline rename editor |
| `deletingId` / `duplicatingId` | Row-level action loading state |
| `wizardMode` | `null \| "choice" \| "scratch" \| "builder" \| "starter"` |
| `builderStep` | 1 / 2 / 3 within Builder wizard |
| `bName`, `bShape`, `bWidth`, `bLength` | Builder inputs |
| `borders` | `Record<edgeId, EdgeConfig>` — per-edge border style + height |
| `selectedEdgeId` | Which edge the user has tapped in step 3 |

### Data flow — read paths

```ts
supabase.from("garden_layouts")
  .select("*")
  .eq("home_id", homeId)
  .order("created_at", { ascending: false });
```

### Data flow — write paths

#### Create blank
```ts
supabase.from("garden_layouts")
  .insert({ home_id, name })
  .select().single();
// → navigate(`/garden-layout/${id}`)
```

#### Create from starter template
```ts
supabase.from("garden_layouts")
  .insert({ home_id, name, canvas_w_m, canvas_h_m })
  .select().single();
supabase.from("garden_shapes").insert(template.shapes.map(s => ({ ...s, layout_id })));
```

#### Create via Builder
Inserts the layout, then synthesises a polygon (L/T/trapezoid) or rect (rectangle/square) as the garden boundary shape, then optionally per-edge fence/hedge/wall rectangles based on `BORDER_META` thickness.

#### Rename
```ts
supabase.from("garden_layouts").update({ name, updated_at: now }).eq("id", id);
```

#### Duplicate
1. Read source layout (name, canvas, north_offset_deg).
2. Insert clone with `name + " (Copy)"`.
3. Read all `garden_shapes` for source.
4. Insert clones with new `layout_id`, dropping the original `id` and `plan_id`.

#### Delete
```ts
supabase.from("garden_layouts").delete().eq("id", id);
// FK CASCADE in DB drops associated garden_shapes
```

### Starter templates

Three hardcoded templates live in this file (Wave 12E):

| Template | Canvas | Notable shapes |
|----------|--------|----------------|
| Allotment Plot | 14 × 9 m | 4 raised beds, main path, shed |
| Front Border | 12 × 5 m | hedge, planting strip, path |
| Container Terrace | 6 × 6 m | 6 pots/boxes + water feature |

### Edge → rect geometry

`edgeToRectGeom(edgeId, shape, gW, gH, ox, oy, t)` maps a logical edge (`top` / `right` / `inner-horiz` etc.) to an axis-aligned rectangle in metres, with thickness `t` from `BORDER_META`. Only rectangle, square, and L-shape are supported — T-shape and trapezoid skip per-edge configuration with a "not yet" message.

### Edge functions invoked

None — pure Supabase CRUD.

### Cron / scheduled jobs that affect this surface

None directly. Indirect: any cron that adds shapes (e.g. `sync-areas-to-shapes`) is reflected in dimensions if you read the editor.

### Realtime channels

None — list is fetched once on mount.

### Tier gating

None — every tier can create and edit layouts.

### Beta gating

None.

### Permissions

- `home_members.role` — viewers cannot use create/rename/delete/duplicate buttons. Buttons stay rendered but writes are blocked by RLS.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Toast "Could not load layouts." |
| Create fails | Toast "Could not create layout." / "Could not create starter layout." |
| Rename / delete / duplicate fails | Per-action toast |

### Performance

- Single fetch on mount; no realtime.
- Wizard modal lazy-renders only when `wizardMode !== null`.
- Inline rename editor avoids a separate modal.

### Card layout — responsive actions (2026-07-08)

The whole card body (icon + name + dimensions) is ONE navigation button
(`open-layout-<id>`). Rename/duplicate/delete render inline (`rename-layout-*`
etc.) only at `sm:`+; below that they collapse into a kebab menu
(`layout-menu-<id>` → `layout-menu-rename/duplicate/delete-<id>`). Before this,
four fixed 44px icon buttons left ~50px of tappable title at 390px and card
taps landed on Rename — phones could not open the editor at all
(docs/plans/garden-layout-fixes-and-mobile-readonly.md).

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Garden Layouts are Rhozly's spatial brain — a top-down map of your garden where shapes represent beds, fences, paths, sheds, pots, and other landscape features. The layout drives sun analysis (which shapes are where, what's casting shadow), microclimate inferences (wind exposure from boundary walls), and the 3D Garden Layout View on Sage/Evergreen tiers.

If you skip drawing a layout, the app still works — but tasks lose their spatial context, and the AR sun tracker has nothing to overlay onto.

### Every flow on this screen

#### 1. Plus button → choose creation method

The wizard's first screen offers three buttons with growing levels of guidance:

- **Blank Canvas** — recommended for users who already know the editor.
- **Garden Builder** — recommended for first layouts. Walks you through name → shape → size → borders.
- **Starter Layout** — recommended for users who want to *see* something quickly. Picks a pre-made garden and drops it in.

#### 2. Garden Builder wizard

- **Step 1 — Name & Shape:** Pick from Rectangle, Square, L-Shape, T-Shape, or Trapezoid. The shape is the boundary; you'll add beds and features inside later.
- **Step 2 — Size:** Enter width and length in metres (square = single dimension). Preview SVG updates live.
- **Step 3 — Border Styles:** For rect/square/L-shape, tap each edge of the preview and assign None / Fence / Hedge / Wall. Each has a default height you can override. (T-shape and trapezoid skip this step — too many edges; add borders manually in the editor.)
- Hit "Create Layout" → land in editor.

#### 3. Starter Layout

- Pick one of three templates.
- Layout is created with all shapes pre-placed. Tweak in editor.

#### 4. Rename / duplicate / delete

- **Rename:** tap pencil, type new name, Enter.
- **Duplicate:** clones the layout *and* every shape inside it. Useful for "what if" planning — keep your current garden as-is, duplicate, redesign the copy.
- **Delete:** removes layout + shapes (FK cascade). Cannot be undone — confirm via the toast on next session.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Layout name | Free-text label. "Back Garden", "Allotment", "Front Border" — anything memorable. |
| Canvas size | Width × height of the drawing surface in metres. Bigger canvas = more drawing room; doesn't have to match real-world garden. |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Every tier | Create / edit / delete layouts. |
| Sage / Evergreen | Editor unlocks the 3D layout view ([06-garden-layout-editor.md](./06-garden-layout-editor.md)) — list page is identical. |

### Common mistakes / pitfalls

- **Creating a layout but never adding shapes.** A layout with no shapes is just a name — no sun analysis, no microclimate. Use Starter or Builder if unsure.
- **Picking T-shape / trapezoid expecting per-edge borders.** The wizard skips that step for these shapes (geometry too complex). You can still add borders in the editor.
- **Confusing canvas size with garden size.** Canvas is the drawing area — make it larger than your garden so you have padding to draw boundary borders.
- **Duplicating then forgetting which is "live".** Duplicates inherit "(Copy)" suffix. Rename one to be authoritative.
- **Looking for rename/delete on a phone.** They live behind the ⋮ menu on each card — tapping the card itself opens the layout.

### Recommended workflows

- **First layout:** Garden Builder, rectangle, real-world dimensions, add fences/hedges to match your boundary.
- **Quick start:** Starter Layout → pick the closest match → edit in editor.
- **Planning a redesign:** Duplicate your current layout → rename "Spring 2027 Plan" → edit freely without touching the live garden.

### What to do if something looks wrong

- **Layout missing from list:** ensure you're scoped to the right home. Switch home from Account → Switch Home.
- **Duplicate silently failed:** check toast; usually RLS denial if you're a viewer.
- **Builder created an empty layout:** if you skipped step 3, that's expected — no borders means no extra shapes added.

---

## Related reference files

- [Garden Layout Editor](./06-garden-layout-editor.md)
- [Microclimate Report](./07-microclimate-report.md)
- [Sun Tracker AR](./08-sun-tracker-ar.md)
- [Garden Shapes (cross-cutting)](../99-cross-cutting/14-garden-shapes.md)

## Code references for ongoing maintenance

- `src/components/GardenLayoutList.tsx` — list + wizard
- `supabase/migrations/*_garden_layouts.sql` — schema
- `src/lib/garden/` — shared shape geometry utilities
