# Plan — Plant Library: pass resolved sciName into the enrichment prompt

## Goal

Eliminate the post-AI skip pattern where:
1. Source (iNat/Wikidata/GBIF) gives us "Wonderberry" + sciName "Solanum nigrum".
2. Pre-AI filter checks `solanum nigrum` against DB — not present → passes.
3. Prompt sends just "Wonderberry" to AI.
4. AI confidently returns `scientific_name: ["Solanum lycopersicum"]` (wrong).
5. Insert collides with existing Tomato row at the same key → SKIP.

The fix: pass the pre-resolved sciName into the prompt so the AI uses it verbatim instead of inventing one.

## Changes

### 1. `filterCandidatesAgainstDb` return type

In both `seed-plant-library/index.ts` and `submit-plant-library-batch/index.ts`:

```ts
async function filterCandidatesAgainstDb(
  db: any,
  candidates: CandidatePlant[],
): Promise<Array<{ name: string; sciName: string | null }>>
```

(Was `Promise<string[]>` — losing the sciName at this boundary was the bug.)

### 2. Callers decorate names with brackets before passing to AI

```ts
const decorated = batch.map((c) =>
  c.sciName ? `${c.name} [${c.sciName}]` : c.name,
);
const stats = await runSeedBatch(db, apiKey, runId, decorated);
```

Format: `Common Name [Scientific name]`. Wikipedia-sourced candidates without a sciName fall back to plain `Common Name` — AI is then free to synthesize, same as before.

### 3. `buildEnrichmentPrompt` prompt text

Add explicit handling for the bracket format:

```
PLANT NAME FORMAT:
- "Common Name [Scientific name]" → USE the bracketed scientific name VERBATIM
  as scientific_name[0]. Our database is keyed on this — using anything different
  causes a silent duplicate-key skip. The common name (before the brackets) is
  what the user knows the plant as; use it as common_name.
- "Common Name" (no brackets) → no scientific name supplied; you determine
  scientific_name[0] yourself. Apply the standard binomial rules below.
```

## Files

| File | Change |
|------|--------|
| `supabase/functions/_shared/plantSeedPrompt.ts` | Add bracket-format instruction to enrichment prompt |
| `supabase/functions/seed-plant-library/index.ts` | `filterCandidatesAgainstDb` returns sciName; decorate in `runOneChunk` before passing to `runSeedBatch` |
| `supabase/functions/submit-plant-library-batch/index.ts` | Same shape change + decorate in submit handler before building batch lines |

## Risks

- AI might return a synonym we didn't recognize even after decoration. Verify pass catches these.
- If AI mis-parses the bracket format (unlikely with low temp + clear instruction), it could carry the brackets into `common_name`. Defensive: client-side strip `\s*\[.*?\]\s*$` from common_name before insert.

## Sequencing

1. Update shared prompt.
2. Update sync seed flow.
3. Update batch submit flow.
4. Typecheck Deno.
5. Deploy `--bump 1`.
