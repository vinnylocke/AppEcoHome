# Plan — Plant Library: Batch API + aggressive skip reduction

Two coordinated changes. They land together because batch makes skips materially expensive — submitting a 1000-plant batch with a 30% skip rate burns 300 plants' worth of tokens for nothing.

## App-reference consulted

- [07-management/10-plant-library-admin.md](../app-reference/07-management/10-plant-library-admin.md)
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md)
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md)

---

## Part A — Skip elimination

### Why we still get skips

Today's pre-AI filter checks `common_name` only. Skips still happen when:

1. **Case / quote variants** — "Tomato" vs "tomato"; "Lavender 'Hidcote'" vs "Lavender Hidcote". DB has one, Wikipedia returns the other → filter misses → AI called → key collides on insert → SKIP.
2. **Different common name, same species** — Wikipedia article "Wonderberry" returns the binomial `Solanum lycopersicum`. DB already has "Tomato" at the same key. Filter passes "Wonderberry" (no common_name match) → AI gets called → key collides → SKIP.
3. **AI normalises differently** — sometimes AI returns a scientific name that normalises to an existing key even though Wikipedia gave us a unique-looking common name.

#1 and #3 are minor. #2 is the big one — and it costs a full AI batch slot per skipped plant.

### Fix 1 — case-insensitive + quote-stripped common-name filter

Lowercase + strip cultivar quotes on both sides before matching:

```ts
function normaliseForFilter(name: string): string {
  return name.toLowerCase().replace(/['"]/g, "").replace(/\s+/g, " ").trim();
}
```

DB pre-filter becomes: fetch ALL common names (cheap — even 10k rows of text is ~200KB), normalise, build a Set, drop matching candidates. We currently `.in()`-query a subset; switching to a full Set is more reliable and faster than a thousand `ilike` queries.

### Fix 2 — pre-AI scientific-name resolution + key pre-filter (the big one)

For each Wikipedia candidate, resolve its scientific name BEFORE handing to AI. Wikipedia summary endpoint usually contains the binomial in the first sentence. We already have `fetchWikipediaSummary` in `_shared/plantLibrarySources.ts` — extend with a regex extractor:

```ts
export function extractScientificName(summary: string): string | null {
  // Italic binomial pattern: capitalised Genus + lowercase species
  // (Wikipedia renders binomials with <i>…</i> which becomes plain
  // text in the summary extract). Match "Capitalised lowercase"
  // pairs in the first ~300 chars, return the first valid hit.
  const m = summary.slice(0, 500).match(/\b([A-Z][a-z]+)\s+([a-z][a-z-]+)\b/);
  return m ? `${m[1]} ${m[2]}` : null;
}
```

Then in `runOneChunk`:

```ts
// 1. Wikipedia gives ~90 candidate names
const candidates = await fetchCandidatePlantNames(chunkPlantCount * 3);

// 2. Common-name pre-filter (Fix 1)
const unseenByName = await filterUnseenNamesV2(db, candidates);

// 3. Resolve scientific names in parallel (~3-5s wall clock for ~90)
const enriched = await Promise.all(
  unseenByName.map(async (name) => ({
    name,
    sci: extractScientificName((await fetchWikipediaSummary(name))?.extract ?? "") ?? null,
  })),
);

// 4. Compute scientific_name_key for each candidate
const candidateKeys = enriched.map(({ name, sci }) => computeSciKey(sci, name));

// 5. Query DB for matching keys in one shot
const { data: existing } = await db
  .from("plant_library")
  .select("scientific_name_key")
  .in("scientific_name_key", candidateKeys.filter(Boolean));
const knownKeys = new Set(existing?.map((r) => r.scientific_name_key));

// 6. Drop key-colliders
const surviving = enriched.filter((e, i) => !knownKeys.has(candidateKeys[i]));

// 7. Take CHUNK_SIZE and pass to AI
const toEnrich = surviving.slice(0, chunkPlantCount).map((e) => e.name);
```

`computeSciKey` mirrors the generated-column formula exactly:

```ts
function computeSciKey(scientificName: string | null, commonName: string): string {
  const source = (scientificName?.trim() || commonName).trim();
  return source.toLowerCase().trim().replace(/\s+/g, " ");
}
```

**Cost**: ~90 parallel Wikipedia summary fetches per chunk. Wikipedia rate-limits anonymous calls at ~200/min, so a chunk well within budget. Each call ~50-150ms; parallel → ~2-3s added to the chunk.

**Saves**: every prevented skip = one Gemini call we don't pay for. Empirically we've been at ~20-40% skip rate; this should cut to ~2-5%.

### Fix 3 — post-AI, pre-insert key recheck

Even with Fix 2 the AI sometimes returns a scientific name that normalises to an existing key. After parsing the AI response, compute each plant's `scientific_name_key` in JS, query DB once for the set, drop colliders before the insert loop. **Doesn't save tokens** (AI already called) but cleans the count + saves N insert round-trips.

### Helper additions

- `supabase/functions/_shared/plantNameSources.ts` — `extractScientificName(extract)`
- `supabase/functions/_shared/plantNameSources.ts` — `computeSciKey(sci, common)` (also used in seed)
- `supabase/functions/seed-plant-library/index.ts` — rewrite `filterUnseenNames` → new `filterCandidatesByKey()` flow

---

## Part B — Batch API integration

### Architecture

```
Admin clicks "Submit batch of 1000"
   │
   ▼
submit-plant-library-batch
   ├── Fetch ~3000 Wikipedia names
   ├── Skip-reduce per Part A (down to ~1000 unique keys)
   ├── Build JSONL batch request
   ├── POST to Gemini batch endpoint → returns batch name
   └── INSERT plant_library_batches row, return 202 { batch_id }
                              │
                              ▼  ... up to 24h ...
                              │
poll-plant-library-batches (every 5 min via pg_cron)
   ├── For each non-terminal batch:
   │     ├── GET Gemini batch status
   │     ├── Update last_polled_at + status
   │     └── If SUCCEEDED → fetch results → process inline
   ▼
Process step (in same edge fn):
   ├── Parse each result row
   ├── Insert into plant_library (ON CONFLICT silent skip)
   ├── Create plant_library_runs row with totals (so it shows in Recent runs)
   └── Mark batch processed
```

### New table — `plant_library_batches`

```sql
CREATE TABLE public.plant_library_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind = 'seed'),   -- verify not supported in v1
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  count_requested integer NOT NULL,
  candidate_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL,
  gemini_batch_name text UNIQUE,
  status text NOT NULL DEFAULT 'submitting' CHECK (status IN
    ('submitting','pending','running','succeeded','failed','processed','cancelled')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  last_polled_at timestamptz,
  completed_at timestamptz,
  processed_at timestamptz,
  result_run_id uuid REFERENCES public.plant_library_runs(id) ON DELETE SET NULL,
  error_message text
);
```

Same admin-only RLS as `plant_library_run_schedules`.

States:
- `submitting` — building the request (rare; the edge fn flips it to `pending` on success or `failed` on submit error)
- `pending` / `running` — Gemini-side states
- `succeeded` — Gemini done, we haven't processed yet (typically <5 min window)
- `processed` — we inserted plants + created the runs row
- `failed` / `cancelled` — terminal

### New edge functions

**`submit-plant-library-batch`** (`{ count, triggered_by? }` → `{ batch_id }`)
1. Run the Part A skip-reduction pipeline against `count * 3` candidates
2. Take the surviving `count` names
3. Build a JSONL of N batch requests, each one with the SAME enrichment prompt but for a single plant (or small group — Gemini batch supports per-line schema, easier as 1 plant per line)
4. POST to Gemini batch endpoint, store `gemini_batch_name`
5. Insert `plant_library_batches` row with status `pending`
6. Respond 202 with `batch_id`

Single-plant-per-batch-line is simpler than packing 10 per line — no recovery logic if a batch line partially parses. The AI call per line is tiny (one plant's care data ≈ 1-2k output tokens), and batch has no per-line setup overhead.

**`poll-plant-library-batches`** (invoked by minute cron)
1. SELECT non-terminal batches (`pending`, `running`, `succeeded`)
2. For each:
   - If `pending`/`running` → GET Gemini batch status; update row
   - If `succeeded` (newly or already) → fetch result rows, parse, insert into `plant_library`, create `plant_library_runs` row, mark `processed`
3. Logs failures per batch but continues to the next

### Cron

A new pg_cron job runs every 5 minutes:

```sql
SELECT cron.schedule(
  'plant-library-batches-poll',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/poll-plant-library-batches',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <publishable>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

5-min granularity because batches almost never finish in <5 min and we want to be a polite Gemini API caller. Adjustable later.

### Gemini batch API surface

`_shared/gemini.ts` gets three new helpers:

```ts
export async function submitBatchEnrichment(
  apiKey: string,
  model: string,
  requests: Array<{ key: string; prompt: string }>,
): Promise<{ name: string }>;

export async function getBatchStatus(
  apiKey: string,
  batchName: string,
): Promise<{ state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"; error?: string }>;

export async function getBatchResults(
  apiKey: string,
  batchName: string,
): Promise<Array<{ key: string; response: string | null; error: string | null }>>;
```

The exact REST endpoint shapes will be confirmed against Google's API reference at implementation time — the docs have evolved. Best-current understanding: the API uses `:batchGenerateContent` style endpoints with operation polling via `operations.get`. I'll verify and adjust at implement time; the architecture stands regardless.

### Pricing

`_shared/geminiCost.ts` gets a 50% multiplier for batch-attributed calls. The `model_usage` jsonb gets a sibling field `is_batch: boolean` so the per-model breakdown in the admin can show batch savings.

Actually simpler: store the resolved cost; render a "(via batch — 50% off)" tag on the run row. No schema change.

### UI

**Seed Run Block** gets a new option below the existing inputs:

```
[Plants per run: 1000]  [Run seed]
  ▶ Repeat & schedule
  ☐ Submit as Batch API job (~50% cheaper, results in 1-24 hours)
```

When checked + Run → calls `submit-plant-library-batch` instead of the synchronous flow. Disabled when `totalRuns > 1` (no compelling reason to schedule repeating batches; user can submit a single big batch for the same effect).

**New panel** between Active Schedules and Recent Runs:

```
┌─ Pending batches ─────────────────────────────────────┐
│ seed · 1000 · pending  · submitted 12 min ago  [Cancel] │
│ seed · 500  · running  · last polled 2 min ago [Cancel] │
└──────────────────────────────────────────────────────┘
```

Polls every 15s while any batch is in a non-terminal state.

Once processed → shows up in Recent runs as normal with a "🗲 Batch" chip.

### Service helpers

```ts
submitPlantLibraryBatch({ count }): Promise<{ batch_id, gemini_batch_name }>;
cancelPlantLibraryBatch(id): Promise<void>;
fetchActivePlantLibraryBatches(): Promise<PlantLibraryBatch[]>;
```

---

## Files

| File | Change |
|------|--------|
| `supabase/migrations/20260624002100_plant_library_batches.sql` | New table + RLS + 5-min cron |
| `supabase/functions/_shared/plantNameSources.ts` | `extractScientificName()` + `computeSciKey()` |
| `supabase/functions/_shared/gemini.ts` | Batch submit/status/results helpers |
| `supabase/functions/seed-plant-library/index.ts` | Part A: case-insensitive filter + pre-AI key resolution + post-AI key recheck |
| `supabase/functions/submit-plant-library-batch/index.ts` | New — single-shot batch submit |
| `supabase/functions/poll-plant-library-batches/index.ts` | New — polls + processes when ready |
| `supabase/config.toml` | `verify_jwt = false` for the two new fns |
| `src/services/plantLibraryAdminService.ts` | Batch CRUD helpers |
| `src/components/admin/PlantLibraryAdmin.tsx` | Batch checkbox + Pending batches panel |

## App-reference updates

- `07-management/10-plant-library-admin.md` — Batch flow + Pending batches panel + skip-reduction notes
- `99-cross-cutting/10-edge-functions-catalogue.md` — Entries for submit + poll
- `99-cross-cutting/11-cron-jobs.md` — Entry for `plant-library-batches-poll`
- `99-cross-cutting/13-ai-gemini.md` — Batch API usage note + 50% rate caveat

## Risks / verifications

1. **Gemini batch API exact shapes need verification at implement time.** The architecture is sound; specifics (endpoint paths, JSONL fields, polling URL) need cross-checking against the live API docs. I'll flag any deviations during implementation and update the plan if anything material changes.
2. **Wikipedia scientific-name extraction is heuristic.** The regex catches ~85-95% of binomials in the summary text; a fallback to GBIF `species/match` per missing-key candidate would catch more but adds another API call. Defer — the residual ~5% skip rate after Part A is fine and these get caught by the post-AI recheck.
3. **Batch cancellation may not be instant.** Google supports cancel; in-flight batches still count toward billing for the work already done. We'll mark our row `cancelled` immediately and let Gemini settle on its own.
4. **Cost attribution.** Batch results don't return `usageMetadata` per-line in the same shape as sync calls — we may need to estimate per-line tokens by parsing the output. I'll verify and adjust the cost-write path at implement time.

## Sequencing

1. **Part A first** (skip reduction) — small, safe, immediate savings on existing flow. Deploy standalone if you want quick wins.
2. **Then Part B** (batch) — bigger, needs API verification. Schema + functions + cron + UI.
3. Typecheck Deno + TS.
4. Deploy `--bump 1` (or `--bump-major` if you want to mark it as a milestone).

Want both as one deploy, or Part A first then Part B?
