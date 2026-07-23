# Seasonal picks — clean names, correct variety matching, fuller care guides

Four related problems, confirmed on the live account. All stem from the picks
pipeline mangling plant identity.

## 1. Variety resolves to the WRONG variety (Lettuce 'Lollo Rossa' → "Daisy Lambert Butterhead")

**Confirmed.** Only ONE `Lactuca sativa` row exists in `plant_library`: id 13498
`"Daisy Lambert Butterhead Lettuce"`. `attachPlantLibraryIds` matches by
`scientific_name_key` alone (`lactuca sativa`), so *any* lettuce cultivar pick
attaches to whatever single row holds that key — here a **different cultivar**.
Worse than the species-collapse: my `preferSpecificName` display fix doesn't
catch it (the catalogue name isn't a prefix of the pick), so it shows "Daisy
Lambert Butterhead". Row 13498 is also **data-poor** (only watering / sunlight /
cycle / soil filled — no description, days-to-harvest, care level), which is why
the care guide looks empty.

**Fix (B).** Make `attachPlantLibraryIds` name-aware: fetch `common_name` for
each `scientific_name_key` candidate and only attach when the row is a genuine
identity match —
- exact (normalised) name match, **or**
- the row is the generic species and the pick extends it (row name is a prefix
  of the pick name, e.g. "Radish" ⊂ "Radish 'French Breakfast'").

If the only same-species row is a *different* cultivar (Daisy Lambert Butterhead
vs Lollo Rossa), **don't attach** → the pick resolves via the AI care path with
its own name + freshly-generated data. Pure helper `bestLibraryMatch(pickName,
rows)` → id | null (Deno-tested).

## 2. Care guide mostly empty when the name is wrong (Q: "is generation correct?")

Largely **downstream of #1**: the pick was cloning a sparse, wrong-cultivar row.
Once #1 routes non-matching cultivars to the AI care path (`generate_care_guide`),
they get rich, cultivar-appropriate data instead of row 13498's four fields.
Belt-and-braces: when a *chosen* library row is missing core care fields, prefer
the AI path so the care guide isn't a stub. I'll verify the AI path fills the
Care tab fields end-to-end after #1.

## 3. Propagation methods leak into the name ("Geranium softwood cuttings", "Lavender 'Hidcote' cuttings")

**Confirmed.** The picks AI puts the method in `common_name` even though a
`sow_method` field already carries it (cutting/division/…). It also poisons the
care guide (the method is locked into the plant name it generates for).

**Fix (A).** Two layers:
1. **Prompt** (`_shared/seasonalPicks.ts` OUTPUT RULES): "`common_name` is the
   plant name ONLY — never the propagation method or action. Write 'Geranium',
   not 'Geranium softwood cuttings'; 'Lavender \"Hidcote\"', not 'Lavender
   \"Hidcote\" cuttings'. The method belongs in `sow_method`."
2. **Normalisation** (`normaliseSeasonalPicks`): a pure `stripPropagationMethod
   (name)` that removes trailing method phrases (softwood/hardwood/root
   "cuttings", "cutting", "division", "from seed", "seeds", "seed", "plug
   plants", "layering", "offsets") — defence in depth against the model. Deno-
   tested.

## 4. Modal name unreadable when long

`PlantDetailModal` title uses `truncate` (single line, clipped). Fixes #1 + #3
shorten most names, but long cultivar names still clip.

**Fix (D).** Let the title wrap — `break-words` + `line-clamp-2` (readable, keeps
the header bounded). CSS-only.

## Existing cached picks

Fixes A/B affect **new** picks; each home's cached `home_seasonal_picks`
self-heals on the weekly cron regen (or the card's Refresh). For an immediate
fix I'll also run a one-off cleanup over stored picks: strip method phrases from
`common_name` and null any `plant_library_id` whose row isn't a genuine name
match (the same logic as B). Reversible/idempotent; reuses the pattern from the
library-junk cleanup.

## Files to change

- `supabase/functions/_shared/seasonalPicks.ts` — prompt rule + `stripPropagation
  Method` in `normaliseSeasonalPicks` (A).
- `supabase/functions/_shared/seasonalPicksHandler.ts` — name-aware
  `attachPlantLibraryIds` via a new pure `bestLibraryMatch` (B).
- `supabase/functions/_shared/plantNameMatch.ts` (**new**, shared pure helpers:
  `stripPropagationMethod`, `bestLibraryMatch`) so both the handler and Deno
  tests use one source.
- `src/components/PlantDetailModal.tsx` — title wrap (D).
- `scripts/fix-seasonal-pick-names.mjs` (**new**) — one-off cleanup of stored
  picks (dry-run + apply), reusing the same strip/match logic.

## Tests

- **Deno**: `stripPropagationMethod` (methods stripped, real names + cultivars
  untouched) and `bestLibraryMatch` (exact / species-prefix / different-cultivar
  → null).
- **Vitest**: none new for the modal (CSS); `preferSpecificName` already covers
  the display layer.
- **Playwright**: manual re-check on the live picks after the cleanup.

## Docs

- `02-dashboard/14-seasonal-picks.md` (name rules + matching), `99-cross-cutting/
  25-plant-providers.md` (matching), `10-edge-functions-catalogue.md` (picks).
- release-notes.json.

## One-off refresh after the fixes (user request)

Yes — after A/B deploy, the picks can be regenerated from the improved prompt.
Mechanism: the card's **Refresh** button already calls `plant-doctor`
`seasonal_picks` with `forceRegen: true`, which bypasses the client + server
cache and re-runs generation with the new prompt/matching. So the practical
one-off is a single tap on the card once the fixes are live. I'll also
force-regenerate the reporter's home server-side as part of shipping so it's
pre-warmed; the client's localStorage cache (keyed by ISO week) still means the
browser shows the refreshed set after a Refresh tap or when the week rolls — the
Refresh button is the clean trigger. (For the whole user base, the Monday
`refresh-seasonal-picks` cron regenerates everyone with the new prompt.)

## Not in scope (flag)

The true cultivar-level catalogue (every Lactuca sativa cultivar its own row +
data) is a larger data-model change. This plan makes cultivars resolve to a
*correct* identity (their own name + AI care, or the generic species with good
data) rather than a wrong sibling — which is what the reports need.
