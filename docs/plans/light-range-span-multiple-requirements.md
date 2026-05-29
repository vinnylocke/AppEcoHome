# Fix — Light tab lux range should span a plant's full set of light requirements

## Goal
On the plant **Light** tab, when a plant has multiple light requirements, the optimal lux range should run from the **lowest** band's minimum to the **highest** band's maximum across all of them (e.g. a "full sun → part shade" plant → part shade's min to full sun's max).

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/28-sun-analysis.md` — lux bands + the per-plant Light reader
- `docs/app-reference/03-garden-hub/01-the-shed.md` — the Light tab entry point

## Root cause (the union already exists, but matching is broken)
`src/lib/plantLightUtils.ts` `getOptimalLuxRange(sunlight: string[])` already takes the lowest `min` and highest `max` across all matched values. The problem is **value matching**:

- Plant `sunlight` is stored in **two formats**: Verdantly normalises to **underscores** (`full_sun`, `part_shade`, `deep_shade`); Perenual/AI/manual use **spaces** (`full sun`, `part shade`).
- The keyword map matches with spaces (`"full sun"`, `"part shade"`) via `includes`, so:
  - `full_sun` matches **nothing** → for a Verdantly plant this returns `null` ("No light data").
  - `part_shade` doesn't match "part shade" but **does** contain `"shade"` → wrongly maps to **Full Shade (0–1500)** instead of Partial Sun (5000–20000).
  - So a Verdantly "full sun → partial shade" plant (stored `["full_sun","part_shade"]`) currently yields **0–1500 "Full Shade"** — completely wrong.

## Fix (`src/lib/plantLightUtils.ts`)
1. **Normalise each value before matching:** lowercase, replace `_` and `-` with spaces, collapse whitespace. So `full_sun`→`full sun`, `part_shade`→`part shade`, `deep_shade`→`deep shade`.
2. Keep the **most-specific-first ordering + break-on-first** so `part shade` maps to Partial Sun (matched before the bare `shade` catch-all). Tidy the keyword list to normalised forms; add `"dappled"` to the filtered band.
3. **Span (unchanged logic):** lowest `min` + highest `max` across every matched value.
4. **Label reflects the span:** track the band label at the lowest min and the band label at the highest max; show `"<low> – <high>"` when they differ (e.g. "Partial Sun – Full Sun"), else the single band label. (Display-only; `getLightFitness` uses min/max, not the label.)

Net effect for `["full_sun","part_shade"]`: **5,000–40,000 lux, "Partial Sun – Full Sun"** — exactly the lowest-to-highest span the user wants.

## Tests (`tests/unit/lib/plantLightUtils.test.ts`)
- Add: `["full_sun"]` → 20000–40000 (underscore now matches).
- Add: `["part_shade"]` → 5000–20000 "Partial Sun" (no longer mis-maps to Full Shade).
- Add: `["deep_shade"]` → 0–1500 Full Shade.
- Add: `["full_sun","part_shade"]` → min 5000, max 40000, label contains both bands.
- Existing space-format + `getLightFitness` tests stay green (normalisation is a superset).

## App-reference docs to update
- `28-sun-analysis.md` — note the per-plant range spans the union of the plant's light requirements (lowest band min → highest band max) and that both underscore (Verdantly) and space (Perenual/AI) formats are handled.

## Risks
- Low. Pure function; existing tests unaffected. Only corrects matching and improves the label.

## Deploy
Frontend-only (no migration / edge fn). One deploy, then push to `main` (now the default closing step).
