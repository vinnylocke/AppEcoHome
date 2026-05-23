# Plan — fewer duplicate proposals from the seeder

## Why we get so many skips

We ARE passing existing plants to the AI as an avoid list. But the cap is 500 most-recently-seeded, which means:

- On a library of 5k+ plants, AI is blind to 80%+ of what we already have.
- The ones it can't see are the EARLIEST seeded — typically the common/popular species (tomato, lavender, basil, rose) that AI keeps re-proposing because they're "obvious".
- So duplicates pile up exactly where we'd expect.

## Three sourcing strategies, increasing in ambition

### A. Bigger + smarter avoid list (small change, biggest immediate win)

Just send a much bigger sample of what we have, and sample it RANDOMLY instead of recency-first so AI sees the breadth of the library.

- Bump `INITIAL_AVOID_FETCH` 500 → 5000.
- Bump `MAX_AVOID_LIST_SIZE` 1000 → 5000.
- Switch from `ORDER BY seeded_at DESC` to `ORDER BY random()`. With 5000 of 10000 plants visible, the dedup hit rate should plummet.
- Strengthen the prompt language about cross-checking before proposing.

Cost: ~30K extra input tokens per batch, ~$0.005 extra per batch on Flash-lite. Per 1000-plant run: ~$0.25 extra. Negligible.

Works until the library crosses ~20K plants, at which point the avoid list becomes a meaningful chunk of the prompt and we'd want to revisit.

### B. Family-rotation seeding (medium change, more systematic)

Stop letting AI free-roam. Each batch focuses on one botanical family:

- Maintain a `plant_library_family_queue` table with ~200 families (Solanaceae, Lamiaceae, Asteraceae, Rosaceae, etc) and a `last_seeded_at` cursor per family.
- Cron run picks the LEAST-recently-seeded family.
- Prompt becomes: *"Give me 20 well-known cultivated plants in family Lamiaceae that aren't on this list: …"*
- After each batch, bump the family's `last_seeded_at`.

Pros: each batch is botanically scoped, dramatically less likely to re-suggest plants from other families. Systematic coverage — we KNOW we'll eventually cover every family.

Cons: requires a seed list of families to start. Adds a table + cron logic. Some families have many cultivars, others have only a handful — load balance is uneven.

### C. Authoritative name-source seeding (big change, bulletproof)

Stop asking AI for plant NAMES. Use AI only for the care DATA.

- Pull species names from **GBIF backbone API** (Plantae kingdom, ~400k accepted names) or **Wikipedia category pages** ("Category:Garden plants", "Category:Edible plants", etc).
- For each name we don't already have, ask AI to fill in care details for that specific plant.
- Bulletproof dedup: the input is a known-finite list with no repeats. We process it in order.

Pros: zero duplicates by construction. Systematic coverage of the entire taxonomic backbone. Names are authoritative (no AI hallucinations of fake species).

Cons: more code (GBIF / Wikipedia client, queue table, per-name AI call). Per-plant cost goes up because we make one AI call per plant instead of batching.

## Recommendation

**Ship A now** — single seeder file edit, immediate wins, no schema change. We can see whether bumping to 5000 + random sampling solves the practical problem.

**Plan B for next wave** if A isn't enough. Family rotation is well-bounded and durable.

**Skip C unless the library becomes a core product surface.** It's the right architecture but the right time to invest in it is when library quality is critical to user-facing UX, not while we're still populating.

## What I'd do today

Option A only:
- `INITIAL_AVOID_FETCH` 500 → 5000
- `MAX_AVOID_LIST_SIZE` 1000 → 5000
- Random sampling order
- Prompt strengthening

Files: one (`supabase/functions/seed-plant-library/index.ts`). No migration.
