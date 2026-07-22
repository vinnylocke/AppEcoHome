# Plant library pollution → variety/food-data mismatches

## The reported symptom

On the live account (home "Shelton Avenue"), the seasonal pick **"Carrot
'Autumn King'"** opens the plant modal, which then flips its common name to
**"Root vegetable"** and shows generic root-vegetable data instead of the
carrot-variety data.

## Root cause — confirmed against prod

1. The stored pick is correct: `common_name: "Carrot 'Autumn King'"`,
   `scientific_name: "Daucus carota"`, and it carries `plant_library_id: 1141`.
2. **`plant_library` row 1141 is polluted**: `common_name = "Root vegetable"`,
   `scientific_name = ["Daucus carota"]`, `description = "A general term for
   edible plant roots…"`, `valid = true`, even `verified_at` set (2026-06-13).
   It's a carrot *species* row mislabeled as the generic category.
3. Clicking the pick → `useCataloguePlantFromResult` paints an instant
   placeholder from the pick (`"Carrot 'Autumn King'"`), then
   `ensureCataloguePlantFromSearchResult` → **`ensureCataloguePlantFromLibrary(1141)`**
   clones row 1141 into the catalogue and swaps it in — so the name changes to
   "Root vegetable" and the data becomes generic. Exactly the observed flip.

### Why the library is polluted (the vector)

- `seasonalPicksHandler.attachPlantLibraryIds` matches each pick to a library
  row by **`scientific_name_key`** (`"daucus carota"`). Whatever single row holds
  that key wins — here the mislabeled "Root vegetable" row.
- Those rows are created by **`seed-plant-library`** (fired in the background for
  library-missing picks, and by bulk seeds). At `index.ts:245` it stores the
  AI's returned `common_name` **verbatim** (`seedRowToColumnShape(p, …)`) —
  unlike `add-plant-to-library`, which pins `common_name` to the *user's input*
  ("Preserve the user's exact input… Gemini may canonicalise 'Sungold Tomato' →
  'Tomato'"). So when Gemini over-generalises a cultivar ("Carrot 'Autumn King'"
  → "Root vegetable") or returns junk, that lands in the global library and even
  passes verification.

### Scope — this is systemic, not one row

- `plant_library` has **93,744** rows; **285** have a single-word (non-binomial)
  `scientific_name_key` — a strong junk signal. Samples: "Tree measurement"
  (`measurement`), "Tree paint" (`lichen`), "Arborist" (`arborist`),
  "Emmenagogue", "Portal:Trees" (`portal:trees`), "Rheophyte", "Hen's Eyes"
  (`scilla`), plus garbled-unicode keys (`carexτης`, `senna蔻a`).
- Plus generic-category rows found in a quick scan: "Root vegetable"
  (Daucus carota, id 1141), "Herb"/"Herbs are" (5691/13587),
  "Vegetable"/"Edible plant" (3635/4790), "Legume"/"Fabaceae" (2581/52411).
- These are the "lot of mismatches / food data getting lost": specific plants
  and varieties resolve, by `scientific_name_key`, onto a mislabeled or generic
  row and inherit its data.

## Proposed remediation (needs your go-ahead — parts B are destructive on prod)

### A. Stop new pollution (edge-function changes, safe to ship)

1. **`seed-plant-library` — preserve the input name.** Pin each inserted row's
   `common_name` to the candidate name we asked for (mirror
   `add-plant-to-library`'s `userInputName` handling), so "Carrot 'Autumn King'"
   stays a carrot, not "Root vegetable".
2. **Reject over-generic / garbage enrichments** before insert (in both
   `seed-plant-library` and `add-plant-to-library`): drop rows whose
   `common_name` is a bare category (Root vegetable / Herb / Vegetable / Legume /
   Fruit / Flower / …) or whose `scientific_name` isn't a plausible binomial
   (two Latin tokens, no stray unicode / "Portal:" / "are"). Better a library
   miss (which the AI care-guide path fills on demand) than a poisoned row.

### B. Clean up the existing pollution (destructive — explicit confirmation first)

1. **Quarantine, don't hard-delete first.** Sweep the junk (non-binomial
   `scientific_name_key` + the generic-category common_names) and set
   `valid = false` so they stop surfacing in search + `attachPlantLibraryIds`
   matching. This is reversible and low-risk. Verify counts before/after.
2. **Fix the reported carrot now.** Quarantine row 1141 and clear the stale
   `plant_library_id: 1141` from the user's `home_seasonal_picks` pick so it
   re-resolves (the AI care path then produces real carrot data). Or hard-fix
   1141's label + re-enrich.
3. **Check references before any hard delete**: catalogue `plants` cloned via
   `forked_from_plant_id`, `favourites.plant_library_id`, and any pick caches
   pointing at a quarantined id. Hard delete only after quarantine proves safe.

### C. Deeper issue (flag as follow-up, not this pass)

Resolving a **cultivar** pick to a **species-level** library row by
`scientific_name_key` is inherently lossy — every Daucus carota cultivar collapses
to one row. Options: prefer the pick's own name/data when it's more specific than
the matched row; or store cultivars as distinct rows. This is a design change to
scope separately.

## Recommended first step

Ship **A** (seeder name-preservation + garbage guard) to stop the bleeding, then
run **B1 + B2** as a reviewed, reversible `valid=false` quarantine (with the
carrot fixed immediately). Hold hard deletes and **C** for a follow-up. Awaiting
your call on scope + the go-ahead for the prod data changes.
