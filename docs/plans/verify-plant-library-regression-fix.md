# Plan — `verify-plant-library` regression: months-vs-seasons + shrinking arrays

## Problem

You reported that the `verify-plant-library` cron is producing two classes of bad amendments:

1. **`flowering_season` and `harvest_season` come back as months** (`"June"`, `"July"`, …) instead of seasons (`"summer"`, `"autumn"`).
2. **`propagation` and `attracts` come back drastically shortened** — the verifier "amends" a plant with `["seed", "division", "cuttings"]` down to `["seed"]`, and a plant with `["bees", "butterflies", "hummingbirds"]` down to `["bees"]`.

Both bugs trash data that the seed step put there correctly. Once the verifier writes the amendment, that's it — the original richer list is lost.

## Why it's happening (root cause)

I read [`verify-plant-library/index.ts`](../../supabase/functions/verify-plant-library/index.ts) end-to-end and cross-checked with the seed prompt at [`_shared/plantSeedPrompt.ts`](../../supabase/functions/_shared/plantSeedPrompt.ts).

The verifier's prompt only describes the *tolerance for matching* (lines 117–129):

```
- family / plant_type / propagation / flowering_season / harvest_season: set-overlap → OK
- All other jsonb arrays: set-overlap → OK
```

It says nothing about the *shape or vocabulary* the model should use when it produces an `amended` payload. The output schema (`VERIFY_SCHEMA`) just declares `updates: { type: "OBJECT" }` — every field is free-form. So Gemini:

- Reads our row: `flowering_season: ["summer"]`
- Reads Wikipedia: *"flowers from June to August"*
- Decides our row is incomplete → amends → writes `["June", "July", "August"]` (it faithfully extracts the months it just read)

Same dynamic for `propagation` and `attracts`: Wikipedia mentions one method or one pollinator, so the AI overwrites our multi-element seed list with the smaller list it can directly cite. The set-overlap rule was supposed to *prevent* an amendment in that case ("we have a superset, that's fine, no change") — but the AI is interpreting "set-overlap" as the bar for matching every element, not just one. The prompt never makes the "non-shrinking" rule explicit.

Once `amended` lands, [`pickAllowedUpdates`](../../supabase/functions/verify-plant-library/index.ts) only sanity-checks numeric fields. The array shape is whatever the AI returned.

## Constraints I'm respecting

- This is an edge function, not user-facing UI, so the dual-voice app-reference docs don't strictly apply — but I'll still note the change in [`13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md) and [`10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md).
- Per the CLAUDE.md "Tests are mandatory" rule, every fix lands with a Deno test in `supabase/tests/`.
- The change must be safe to re-deploy mid-flight — existing rows already mangled by past runs need to be detectable and re-verified (we have a separate "force re-verify" path; that's out of scope for this fix).

## Files I'll touch

| File | Why |
|---|---|
| `supabase/functions/verify-plant-library/index.ts` | Tighten the prompt (add vocabulary + non-shrink rules), tighten the response schema (enum for seasons), tighten `pickAllowedUpdates` (drop month-names from season fields, refuse strict-subset amendments to `propagation` / `attracts` / `sunlight` / `soil` / `pest_susceptibility`). |
| `supabase/tests/verify-plant-library-amendments.test.ts` | NEW. Unit tests for the strengthened `pickAllowedUpdates` covering: month-name rejection, subset-array rejection, valid-amendment passthrough. |
| `docs/app-reference/99-cross-cutting/13-ai-gemini.md` | Note the season-vocabulary contract under verifier behaviour. |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Update the `verify-plant-library` entry's "data-shape guarantees" subsection. |

I will NOT touch:
- The seed prompt (already correct).
- The DB schema (no migration needed — the data already lives in the right columns).
- Already-corrupted rows in the live DB — that's a one-time backfill, separate task.

## The fix, concretely

### 1. Prompt — add an OUTPUT VOCABULARY section

After the existing tolerance rules, add:

```
OUTPUT VOCABULARY (applies whenever you produce `updates`)
- `flowering_season` and `harvest_season`: array of season words ONLY.
  Allowed values: "spring", "summer", "autumn", "winter".
  NEVER use month names. If Wikipedia says "flowers June–August", that maps to
  ["summer"]; "April–June" → ["spring", "summer"]; etc.
- `propagation`, `attracts`, `pest_susceptibility`, `pruning_month` (months OK
  here — pruning_month is the literal exception), `sunlight`, `soil`: when our
  row already contains MORE elements than the source explicitly mentions, leave
  it alone. Sources almost never enumerate every propagation method, every
  pollinator, every pest. A shorter cited list is NOT evidence our list is wrong.
- Only return an amendment for these multi-value array fields when our row has a
  value that is FACTUALLY INCORRECT (e.g. our row says `attracts: ["fish"]` for a
  meadow plant). Adding values is OK; removing values is not.
```

### 2. Response schema — constrain seasons to an enum

Change `VERIFY_SCHEMA.properties.updates` from the open `{ type: "OBJECT" }` to a structured object whose `flowering_season` / `harvest_season` items are enum-constrained:

```ts
updates: {
  type: "OBJECT",
  properties: {
    flowering_season: {
      type: "ARRAY",
      items: { type: "STRING", enum: ["spring", "summer", "autumn", "winter"] },
    },
    harvest_season: {
      type: "ARRAY",
      items: { type: "STRING", enum: ["spring", "summer", "autumn", "winter"] },
    },
    // … other fields stay loose so the AI can amend whatever it needs to …
  },
  additionalProperties: true,
},
```

Gemini honours `enum` constraints, so month strings just won't be produced.

### 3. Server-side guard in `pickAllowedUpdates`

Two new defences after the existing numeric coercion:

```ts
const SEASON_ENUM = new Set(["spring", "summer", "autumn", "winter"]);
const SEASON_FIELDS = new Set(["flowering_season", "harvest_season"]);
const NON_SHRINKING_ARRAY_FIELDS = new Set([
  "propagation", "attracts", "pest_susceptibility",
  "sunlight", "soil",
]);

// In the loop, after the NUMERIC_FIELDS branch:
if (SEASON_FIELDS.has(key)) {
  if (!Array.isArray(raw)) continue;
  const cleaned = raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase().trim())
    .filter((v) => SEASON_ENUM.has(v));
  if (cleaned.length === 0) continue;  // never write an empty season list
  out[key] = cleaned;
  continue;
}

if (NON_SHRINKING_ARRAY_FIELDS.has(key)) {
  if (!Array.isArray(raw)) continue;
  const incoming = new Set(raw.filter((v): v is string => typeof v === "string"));
  const existing = new Set(
    (Array.isArray(currentRow[key]) ? currentRow[key] as string[] : [])
      .filter((v): v is string => typeof v === "string")
  );
  // Reject strict subsets: the amendment removes at least one existing value
  // and adds nothing new.
  const removed = [...existing].filter((v) => !incoming.has(v));
  const added = [...incoming].filter((v) => !existing.has(v));
  if (removed.length > 0 && added.length === 0) continue;
  // Otherwise merge — keep all original values, add the new ones.
  const merged = new Set([...existing, ...incoming]);
  out[key] = [...merged];
  continue;
}
```

`pickAllowedUpdates` now takes the original row as a second argument so the subset check has something to compare against. The call site already has the row in scope.

### 4. Test coverage

`supabase/tests/verify-plant-library-amendments.test.ts` — pure unit tests for `pickAllowedUpdates`:

- Month-name rejection: input `flowering_season: ["June", "July"]` → field dropped from updates.
- Mixed seasons + months: input `flowering_season: ["summer", "August"]` → only `["summer"]` retained.
- Lowercase normalisation: input `["Summer"]` → `["summer"]`.
- Strict-subset rejection for `propagation`: existing `["seed", "division"]`, AI returns `["seed"]` → field dropped.
- Subset + addition allowed: existing `["seed", "division"]`, AI returns `["seed", "tissue culture"]` → merged to `["seed", "division", "tissue culture"]`.
- Numeric fields untouched (regression — existing behaviour stays green).

Exporting `pickAllowedUpdates` from the edge function module so the Deno test can import it. (Currently it's module-private.)

### 5. Doc updates

- `13-ai-gemini.md`: under "Plant Library Verifier" add a "data-shape contract" subsection listing the season vocabulary + non-shrink rules.
- `10-edge-functions-catalogue.md`: update the verifier row's notes.

## Risks / edge cases

- **Pruning months**: `pruning_month` legitimately stores months (`"march"`, `"october"`). I'm specifically NOT adding it to `SEASON_FIELDS` — leave it alone.
- **Empty season list after filtering**: if the AI returns `["June", "July"]` only, the cleaned array is empty. I skip the field entirely rather than wipe the existing list to `[]`. The row stays unchanged for that field.
- **Truly wrong existing data**: a row with `attracts: ["fish"]` for a flowering plant can no longer be corrected to `["bees"]` because that's a strict subset. The fix here is to merge — final value `["fish", "bees"]`. Still imperfect, but better than the current behaviour which strips out real data. A future "factual override" path could allow real removals when the source contradicts — out of scope for this fix.
- **One-off backfill** of rows already mangled by past runs: separate task. We'd need a "force re-verify" trigger that picks rows where `verified_at` is recent but a particular column smells wrong. Not in this PR.

## What this does NOT change

- The verdict logic (`matched` / `amended`) — the AI still decides.
- The cost / model cascade — same Gemini Flash → Pro path.
- The default-pass after `MAX_ATTEMPTS` failure — still in place.
- The seeder's prompt — already correct, no changes needed.

## Verification before commit

1. `deno test supabase/tests/verify-plant-library-amendments.test.ts` clean.
2. `npx tsc --noEmit` clean.
3. Manual sanity: deploy to local supabase, invoke the function against a row with known good seed data, confirm the resulting `updates` (if `amended`) respects the vocabulary + non-shrink rules.

---

**This is the plan. Reply "go ahead" / "looks good" / "yes" to approve and I'll implement, or tell me which part to revise.**
