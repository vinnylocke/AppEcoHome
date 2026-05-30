# Plan — Retire the Lens, promote Plant Doctor to the first quick link

## What the user wants

1. Remove **the Lens** (`/quick/lens`) — it's redundant with the full Plant Doctor.
2. Make **Plant Doctor** the **first** entry in the default quick-links menu.
3. **Rename + re-icon** the tile so it reflects what the tool actually does (identify, diagnose, suggest care tasks — all photo-driven). The user said "Plant Doctor" might be too narrow and the icon should reflect the camera-first nature.
4. **Overhaul the Capture tile**: instead of the stripped-down `/quick/journal` page, the tile should open the **full Journal** with the **Add Entry** sheet already open. Delete the standalone quick-capture page.

## Investigation

- **The Lens** = `id: "lens"` in `src/lib/quickLauncherCatalogue.ts:88` (`label: "Lens"`, `route: "/quick/lens"`, `Camera` icon). It's also the **first** entry in `DEFAULT_QUICK_LAUNCHER_PINS` (line 215). The route renders `QuickAccessLens` (`src/components/QuickAccessLens.tsx`), which is a thin wrapper around `<PlantDoctor compact />` — the same component, just hiding the header / History tab / secondary action row. So removing the Lens removes a duplicate path into Plant Doctor, not a separate feature.
- **The Doctor tile** already exists in the catalogue at line 145 (`label: "Doctor"`, `Stethoscope` icon, `route: "/doctor"`). It's just not in the default pins.

## Changes

### `src/lib/quickLauncherCatalogue.ts`
- Remove the `lens` catalogue entry.
- `DEFAULT_QUICK_LAUNCHER_PINS`: `["lens", "today", "capture", "library"]` → `["doctor", "today", "capture", "library"]` (Plant Doctor first).
- Update the doctor entry's **label** (currently `"Doctor"`) and optionally its **icon** — see question below.

### `src/App.tsx`
- Remove the `/quick/lens` Route + the `QuickAccessLens` lazy import.

### `src/components/QuickAccessLens.tsx`
- Delete the file (now unreferenced).

### `src/components/PlantDoctor.tsx`
- The `compact` prop becomes dead code (only `/quick/lens` set it). Leave the branches in place for now — ripping them out is a separate, larger refactor and the cost of dead code is low.

### Capture tile overhaul

- **`src/lib/quickLauncherCatalogue.ts`** — `capture` entry: `route: "/quick/journal"` → `route: "/journal?open=add-entry"`. (Considering a label refresh — but the user didn't flag one, so I'll keep `"Capture"`.)
- **`src/App.tsx`** — remove the `/quick/journal` Route + the `QuickCaptureJournal` lazy import.
- **Delete `src/components/QuickCaptureJournal.tsx`** (now unreferenced).
- **Journal page** — auto-open the Add-Entry sheet on mount when `?open=add-entry` is present (mirroring the existing `TaskCalendar` pattern at `App.tsx:99-103`: read `searchParams.get("open")`, open the sheet, `delete` the param via `setSearchParams(..., {replace:true})` so refreshes don't re-open it). I'll locate the Journal page component and its Add-Entry handler during implementation; the change is local to that component.

## Removing the Lens is safe

The catalogue's own comment confirms it ("Removing an id from the catalogue is non-destructive: the render filter drops unknown ids silently"). Existing users whose saved pins include `"lens"` will simply see it drop from their grid; they can re-pin Plant Doctor if they want it back.

## Tests to update

- `tests/unit/lib/quickLauncherCatalogue.test.ts` — drop any `lens` assertions; assert `doctor` is first in defaults.
- `tests/unit/lib/quickLauncherPrefs.test.ts` — same.
- `tests/unit/components/QuickAccessHome.test.ts` — same.
- `tests/e2e/specs/quick-access.spec.ts` — drop `/quick/lens` references.

## Docs to update

- `docs/app-reference/02-dashboard/09-quick-access-home.md` — defaults updated, Lens removed.
- `docs/app-reference/05-tools/02-plant-doctor.md` — drop the `compact` `/quick/lens` row.
- `docs/app-reference/02-dashboard/11-quick-capture-journal.md` — if it cross-links Lens.
- `docs/app-reference/99-cross-cutting/21-routing.md` — drop the `/quick/lens` row.
- `docs/app-reference/00-INDEX.md` — drop any Lens reference.
- `docs/e2e-test-plan.md` — drop Lens-specific rows.

## Migration

None. `user_profiles.quick_launcher_pins` is just a text array; orphan `"lens"` values are silently filtered at render.

## Process

1. Get the icon/label choice (question below).
2. Catalogue + App route + delete component → tests → docs.
3. `npx tsc --noEmit` + `npm run build` + `npm run test:unit`.
4. Release note (Removed + Improved); deploy `--bump 1`; push to main.

## Open question — the new name for the tool (and tile)

The user wants a name broad enough for **identify + diagnose + care-task suggestions** and an icon that signals **camera/photo**. Per the user's direction the icon will be camera-based; only the **name** is still open. I'll ask via a question alongside this plan.

**Scope of the rename:** the **tile label** + the **screen heading** (`/doctor` page H1) + user-facing copy in the app-reference. The **route stays `/doctor`** and internal action ids (`identify_vision`, `identify_pest`, `identify_scene`, `analyse_comprehensive`) **stay as-is** — they're internal, and renaming them is a much bigger task with no user benefit.
