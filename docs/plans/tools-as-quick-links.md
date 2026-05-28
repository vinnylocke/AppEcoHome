# Plan — Make the Tools pinnable as Quick Links

## Goal
Let users pin the app's Tools (Garden Layout, Plant Visualiser, Light Sensor, Sun Tracker, Guides) to the Quick Launcher on `/quick`, alongside the existing destinations.

## How it works today
The Quick Launcher is driven by `QUICK_LAUNCHER_CATALOGUE` in `src/lib/quickLauncherCatalogue.ts`. The picker (`src/components/quick/QuickLauncherPicker.tsx`) auto-renders every available catalogue entry via `partitionForPicker`, and pins persist in localStorage + `user_profiles.quick_launcher_pins`. **So making a tool pinnable = adding a catalogue entry.** No picker/persistence changes needed.

Current catalogue: lens, today, capture, library, shed, planner, walk, doctor, shopping. Plant Doctor is already pinnable; the other Tools Hub tools are not.

## App-reference consulted
- `docs/app-reference/02-dashboard/09-quick-access-home.md` (Quick Launcher)
- `docs/app-reference/05-tools/01-tools-hub.md` (the tools + routes)

## Change
Add 5 entries to `QUICK_LAUNCHER_CATALOGUE` (routes verified against `ToolsHub.tsx` + `App.tsx`):

| id | label | route | icon (lucide) | accent |
|----|-------|-------|---------------|--------|
| `garden-layout` | Layout | `/garden-layout` | `LayoutGrid` | purple |
| `visualiser` | Visualiser | `/visualiser` | `ScanLine` | blue |
| `light-sensor` | Light Sensor | `/lightsensor` | `SunMedium` | amber |
| `sun-tracker` | Sun Tracker | `/sun-trajectory` | `Compass` | teal |
| `guides` | Guides | `/guides` | `GraduationCap` | slate |
| `journal` | Journal | `/journal` | `NotebookText` | red |

`journal` → the full Global Journal at `/journal` (distinct from the existing `capture` pin which opens `/quick/journal` quick-capture mode).

- No gating predicate — these routes only require a home (same as existing entries). 
- `QUICK_LAUNCHER_MAX` stays 6; catalogue grows from 9 → 14 options, user still pins up to 6.
- Defaults unchanged (lens/today/capture/library).
- Ids are stable + new, so no existing pins are orphaned.

## Files
- `src/lib/quickLauncherCatalogue.ts` — add icon imports + 5 entries.
- `docs/app-reference/02-dashboard/09-quick-access-home.md` — note the tools are now pinnable.

## Tests
- `tests/unit/` — there's likely a catalogue/pins unit test; update any count assertion (mirrors the search-method test fix). `npx tsc --noEmit` + `npm run test:unit`.

## Risk
Very low — additive catalogue entries through an existing, tested extension point. No schema, no picker logic change.

## Deploy
`npm run deploy -- --bump 1` (no migration).
