# Seasonal picks — restore variety names + normalise season/month display

Follow-up to `seasonal-picks-names-and-matching.md` (shipped 41.0061). Three
issues the user hit on their live account after that deploy.

## Problems

### P1 — Variety names disappeared from the picks (regression from 41.0061)
The week-30 picks regenerated on 2026-07-23 06:22 (right after the deploy) came
back **without varieties**: `Lettuce`, `Radish`, `Carrot` — where every prior
week reliably had `Lettuce 'Lollo Rossa'`, `Radish 'French Breakfast'`,
`Carrot 'Autumn King'`. The new `common_name` schema wording ("The plant name
**ONLY**…") + OUTPUT RULE #10 ("common_name is the plant name ONLY") reads to
Gemini as "species only — drop the cultivar". The intent was only to exclude the
**propagation method**, not the variety. The user explicitly likes the variety
in the name.

### P2 — Season/month fields render as one long string
Opening a pick's **Care** tab shows harvest/flowering season as a single chip
`Spring, Summer, Autumn` instead of three chips `SPRING` `SUMMER` `AUTUMN`.
Root cause: the AI-catalogue path in `src/lib/plantCatalogue.ts`
(`ensureAiCataloguePlant` / `loadCataloguePlant`) does `.join(", ")` to collapse
the array into a **string**, then `ManualPlantCreation`'s `initialData` handling
wraps a non-array string into a **single-element array** (`[the whole string]`),
so the MultiSelect renders it as one chip. Pruning months hit the same path.

### P3 — American "fall" + inconsistent casing
Some picks/library rows carry `fall` (American) and mixed casing (`spring` vs
`Summer`). The Gemini `enum` (`Spring|Summer|Autumn|Winter`) is not being
strictly enforced, so these leak through to the DB and the display.

## App-reference files consulted
- `docs/app-reference/02-dashboard/14-seasonal-picks.md` — picks pipeline + prompt.
- `docs/app-reference/08-modals-and-overlays/38-plant-detail-modal.md` — the Care tab / `ManualPlantCreation` read-only host.
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — `plants` vs `plant_library`; `flowering_season` / `harvest_season` / `pruning_month` columns.
- `docs/plans/plant-library-array-split-and-seed-from-picks.md` — prior comma-split fix (covered the `plant_library` seed path only, not the care-guide/catalogue path).

## Fix

### F1 — Preserve varieties in the picks prompt (`supabase/functions/_shared/seasonalPicks.ts`)
Reword so the ONLY thing excluded is the propagation method, and varieties are
actively encouraged:
- Schema `common_name.description`: lead with "Include the specific variety/
  cultivar in quotes when you have one in mind — e.g. `Tomato 'Sungold'`,
  `Lettuce 'Lollo Rossa'`." Then, as a *separate* clause: "Exclude only the
  propagation method (write `Geranium`, not `Geranium softwood cuttings` — the
  method goes in `sow_method`)." Drop the ambiguous "The plant name ONLY".
- OUTPUT RULE #10: reword to "Keep the variety/cultivar in `common_name`; only
  the propagation **method** is forbidden there (it belongs in `sow_method`)."
- `stripPropagationMethod` (in `plantNameMatch.ts`) is unchanged — it only strips
  trailing method phrases, never the cultivar, so it stays as the safety net.

### F2 — Season/month normaliser (new `src/lib/plantSeasons.ts`)
Pure helpers, unit-tested:
- `normaliseSeasons(input: unknown): string[]` — accepts an array **or** a
  comma-joined string; splits on commas; trims; maps synonyms
  (`fall`→`Autumn`, `year round`/`all year`→`Year-round`); Title-cases; dedupes
  case-insensitively; keeps calendar order (Spring, Summer, Autumn, Winter,
  Year-round) then any extras.
- `normaliseMonths(input: unknown): string[]` — same shape; maps full month names
  and variants (`September`/`Sept`/`sep`→`Sep`) to the canonical 3-letter set;
  drops unrecognised; dedupes; keeps Jan→Dec order.

Apply at the single display choke point — `ManualPlantCreation` `initialData`
ingest (the `safeFlowering` / `safeHarvest` / `safePruning` block):

```ts
flowering_season: normaliseSeasons(initialData.flowering_season),
harvest_season:   normaliseSeasons(initialData.harvest_season),
pruning_month:    normaliseMonths(initialData.pruning_month),
```

Because the normaliser splits joined strings, this fixes **P2** (one chip → many)
and **P3** (fall→Autumn, casing) for **every** source — AI joined-string plants,
library-cloned array plants, and freshly generated guides — on read, with no
data backfill. Existing chips render correctly immediately after a reload.

### F3 — Generation nudge (`supabase/functions/plant-doctor/index.ts`, `generate_care_guide` prompt)
Add one line to the care-guide prompt rules: "Use British English seasons —
`Autumn`, never `Fall`. Each array element is a single value; never comma-join
(`["Spring","Summer"]`, not `["Spring, Summer"]`)." Cheap durable nudge; the F2
normaliser remains the hard guarantee, so no `plant_library` backfill is needed
(consistent with the user's "no massive backfill" steer).

### One-off after deploy — regenerate the user's picks
The F2 fix is display-only and needs no regen. But **P1** needs the corrected
prompt live, then a fresh generation to restore varieties. After deploy, force a
server-side regen of the user's current-week picks (`refresh-seasonal-picks` /
`seasonal_picks` with forceRegen for their home) so W30 comes back with
varieties. The user then reloads + taps Refresh.

## Files
| File | Change |
|---|---|
| `supabase/functions/_shared/seasonalPicks.ts` | Reword `common_name` schema description + OUTPUT RULE #10 to preserve varieties (F1). |
| `src/lib/plantSeasons.ts` | NEW — `normaliseSeasons` / `normaliseMonths` (F2). |
| `src/components/ManualPlantCreation.tsx` | Use the normalisers in the `initialData` ingest block (F2). |
| `supabase/functions/plant-doctor/index.ts` | One British-English + one-value-per-element line in the care-guide prompt (F3). |
| `tests/unit/lib/plantSeasons.test.ts` | NEW — unit tests for both normalisers (joined string, fall→Autumn, casing, dedupe, month names). |
| `supabase/tests/seasonalPicks.test.ts` | Add assertion that the prompt/schema keeps varieties and forbids only the method. |
| `docs/app-reference/02-dashboard/14-seasonal-picks.md` | Note variety-preservation wording. |
| `docs/app-reference/08-modals-and-overlays/38-plant-detail-modal.md` | Note season/month normalisation on ingest. |
| `TESTING.md` | Bump unit + Deno counts. |
| `release-notes.json` | 1 Fixed (varieties back) + 1 Fixed (season/month display). |

## Risks / notes
- Normalising on read never mutates stored data — safe, reversible, no backfill.
- Dropping unrecognised months is intentional (garbage in → nothing rendered vs a
  broken chip); seasons keep title-cased extras so we never silently lose a real
  value.
- Variety reword is prompt-only; behaviour verified by regenerating the user's
  picks post-deploy and confirming varieties return.

## Steps
1. F1 reword. 2. F2 helper + tests + apply in ManualPlantCreation. 3. F3 prompt line.
4. Deno test assertion. 5. `npm run typecheck`, unit + Deno suites, `npm run build`.
6. Docs + release notes. 7. Deploy `--bump 2`. 8. Regenerate user's picks. 9. Commit reset + push.
