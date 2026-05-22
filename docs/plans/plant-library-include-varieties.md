# Plan — seed varieties + cultivars, not just species

## What changes

Today the seed prompt says *"Real species only — no cultivars unless the cultivar is widely commercially distinct from the species"*. That's too conservative — the user wants the library to have rows for "Sungold tomato", "Hidcote lavender", "Cherokee Purple tomato", etc. so app users can find data on the specific variety they actually grow.

**Single change**: rewrite the relevant part of `buildSeedPrompt` in `seed-plant-library/index.ts` to actively encourage a mix of species-level entries AND well-known commercial cultivars/varieties. Each batch should aim for ~40% species, ~60% cultivars where the parent species is popular (tomato, lavender, rose, basil, pepper, lettuce, apple, etc).

Naming convention the prompt enforces:
- `common_name`: includes the variety (e.g. `"Tomato 'Sungold'"`, `"Lavender 'Hidcote'"`).
- `scientific_name[0]`: full cultivar form (e.g. `"Solanum lycopersicum 'Sungold'"`, `"Lavandula angustifolia 'Hidcote'"`). This is what `scientific_name_key` is derived from, so each cultivar gets its own unique key — no collision with the parent species row, no collision between cultivars.

## What we DON'T change

- **Schema**: no new columns needed. The existing `scientific_name_key` unique index handles cultivars naturally — different scientific names → different keys.
- **Verification**: stays as-is. Many cultivars won't appear in GBIF (which is species-level), and Wikipedia coverage for cultivars varies. Those will hit the no-sources branch and default-pass — same fallback as obscure species. The MAX_ATTEMPTS default-pass we just shipped handles the rest.
- **Dedup**: existing unique index catches AI returning the same cultivar twice in different runs. No work needed.
- **Existing rows**: the species-level Lavender entry stays. The new prompt adds variety entries alongside it as fresh rows.

## Trade-off worth flagging

Verification quality is lower for cultivars (GBIF likely returns nothing; Wikipedia patchy). Expect more `valid = true` default-pass results in the cultivar batches than in pure species batches. That's the price of variety coverage. If AI hallucinates a cultivar entirely, the no-sources path still records `valid = true` and the user-facing data may be wrong — but the AI's care info for the parent species is usually correct anyway, so the practical risk is low.

If we later want stronger guard-rails for cultivars, we could add a per-row provenance column (`parent_scientific_name_key`) and reject cultivars whose parent species can't be verified. Out of scope here — let's see how the data looks first.

## Files

| File | Change |
|------|--------|
| `supabase/functions/seed-plant-library/index.ts` | Rewrite the species-only paragraph in `buildSeedPrompt` |

## Sequencing

1. Edit the prompt.
2. Typecheck + deploy.
3. Smoke-test on the admin page — run a seed of 25, expect to see varieties appear in the new rows.
