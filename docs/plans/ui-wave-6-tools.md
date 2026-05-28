# UI Wave 6 — Tools cluster polish

## Goal

Tighten the Tools cluster (Plant Doctor, Plant Visualiser, Light Sensor, Sun Tracker, Garden Layout, Tools Hub) toward 95+. Investigation revealed most of the audit's complaints are already addressed in shipped code:

| Audit item | Status |
|---|---|
| ToolsHub — no descriptions, alphabetical order | **Already done** — grouped by purpose with descriptions + workflows |
| PlantVisualiser — rename "Set Plant Art" → "Choose Plant Icons" | **Already done** |
| PlantDoctor — photo tip on upload | **Already done** ("Good light, close up — try to capture…") |
| PlantDoctor — primary action priority | **Already done** — Confirm identification is the primary green CTA |
| LightSensor — save reading to area | **Already done** — full save flow exists |
| GardenLayout — visible Undo/Redo | **Already done** — both in the toolbar |

What's genuinely worth doing:

1. **Plant Doctor — persona-aware photo tip** — wrap the existing "Good light, close up" hint via `<InfoTooltip>` so experienced gardeners see a dim `?` instead of a full sentence. Demonstrates persona payoff.

2. **Light Sensor — pre-reading instructions** for first-time users — concise dismissable card explaining "hold flat / stay still / where to point the sensor" above the dial.

3. **Sun Tracker — proper loading label** — replace the bare "Loading Home Data..." spinner with `<SurfaceLoader shape="spinner" label="Mapping the sun's path…">` so the user understands the wait.

## Sensible-default decisions

| Decision | Choice |
|---|---|
| First-visit tour for Sun Tracker / Garden Layout? | **Defer** — bigger feature, would touch many files. |
| Sun Tracker seasonal compare mode? | **Defer** — substantial feature, not a polish item. |
| Plant Doctor confidence chip enlargement? | **Skip** — current chip is fine (% pill is clear enough). |
| Sample garden in Garden Layout? | **Defer** — separate "tutorial mode" effort. |

## App-reference files consulted

- [`docs/app-reference/05-tools/02-plant-doctor.md`](docs/app-reference/05-tools/02-plant-doctor.md)
- [`docs/app-reference/05-tools/03-light-sensor.md`](docs/app-reference/05-tools/03-light-sensor.md)
- [`docs/app-reference/05-tools/04-sun-tracker.md`](docs/app-reference/05-tools/04-sun-tracker.md)

---

## Files

| File | Change |
|---|---|
| `src/components/PlantDoctor.tsx` | Wrap photo-tip text in an `<InfoTooltip>` so experienced gardeners see a dim `?` instead of a tip line. |
| `src/components/LightSensor.tsx` | Add a dismissable first-time-user instructions card above the dial — "hold flat / stay still / point at the area". |
| `src/App.tsx` (Sun Tracker route) | Use `<SurfaceLoader shape="spinner" label="…">` instead of bare loader for the home-data wait. |

---

## Risks & edge cases

- **Light Sensor instructions dismissal** — store in localStorage so the user only sees them once per device. Key: `rhozly:lightsensor:instructions-dismissed`.
- **Persona null users** — for the photo tip, treat null persona as `new` (show the full sentence) so existing users + skippers aren't surprised by missing copy.

## Steps

1. Plant Doctor photo tip via InfoTooltip.
2. Light Sensor pre-reading instructions card.
3. Sun Tracker loading state polish.
4. Typecheck + tests + deploy.
