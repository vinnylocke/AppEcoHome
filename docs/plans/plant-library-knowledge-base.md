# Plan — `plant_library` knowledge base (AI-seeded, verified, admin-driven)

## Goal

Stand up a self-populating global plant knowledge base so future read paths in the app can hit our own DB instead of AI/Perenual/Verdantly every time. Two-stage pipeline:

1. **Seed**: ask Gemini for N plants of varying types, fetch a free thumbnail per plant, insert into `plant_library` with `valid = null`.
2. **Verify**: for each unverified row, fetch Wikipedia + GBIF, ask AI to compare against our row, set `valid = true` (matched) or amend the row + set `valid = false` and record the sources used.

Runs daily via cron (1000 plants/day target). Admins can also trigger ad-hoc runs from a new `/admin/plant-library` page.

## App-reference / code consulted

- `src/components/UserProfileDropdown.tsx` — where the new admin entry will live.
- `supabase/functions/plant-doctor/index.ts` — pattern for AI calls via Gemini + `aiCache`.
- `supabase/functions/plant-image-search/index.ts` — reuse for the Wikipedia/Pixabay/Unsplash thumbnail per plant.
- `supabase/migrations/20260624000600_nursery_scan.sql` — recent example of cron + edge fn wiring.
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` — registry to update.

## Decisions locked in

| Question | Answer |
|---|---|
| Plant source | Let AI pick; dedupe via unique index |
| Verification | Wikipedia summary **AND** GBIF taxonomic record |
| Run mode | Fire-and-forget background; UI polls `plant_library_runs` |
| Care comparison | Tolerance-banded per field (see "Verification rubric" below) |

## Verification rubric

The verifier's structured prompt asks the AI to evaluate each field against tolerance bands rather than strict equality. Returns `verdict: 'matched'` only when ALL rules pass; on mismatch the `updates` payload contains ONLY the fields that failed.

| Field group | Rule |
|---|---|
| `watering_min_days` / `watering_max_days` | Within ±2 days of online sources OR ranges overlap. |
| `watering` (frequent/average/minimum) | Exact match. |
| `sunlight` (array) | At least one overlapping category. |
| `cycle` (annual/perennial/biennial) | Exact — taxonomic fact. |
| `care_level` (low/medium/high) | Within one step. |
| `hardiness_min` / `hardiness_max` | Within ±1 USDA zone. |
| `is_edible`, `is_toxic_pets`, `is_toxic_humans` | **Exact, no tolerance** — safety-critical. |
| `family`, `plant_type`, `propagation`, `flowering_season`, `harvest_season` | Set-overlap (any shared value passes). |
| `description` | Semantic-match — verbatim wording differences pass. |
| All other fields | Set-overlap for jsonb arrays; tolerance ±1 step for ordinal-text fields. |

Toxicity is deliberately strict — if our row says "safe for pets" and Wikipedia/GBIF disagree, that MUST flip `valid = false` and amend the column. A wrong toxicity flag is the worst possible failure mode for the app.

## Legal & licensing

### What's safe

- **GBIF API** — taxonomic backbone is largely public-domain / CC0. Commercial use allowed; attribution requested if redistributing substantial portions.
- **Pixabay / Unsplash images** — licences allow commercial use without attribution (Unsplash appreciates it). `plant_image_cache.attribution` already tracks photographer info.
- **Gemini output** — Google's terms grant a commercial licence to outputs (we just can't train a competing foundation model on them, which we aren't).
- **Facts themselves** — taxonomic and care facts aren't copyrightable. Only their specific expression is.

### What needs care

- **Wikipedia text is CC BY-SA 4.0** — verbatim copying would force us to (a) attribute and (b) license our derivative as CC BY-SA. Mitigation: the verifier prompt **explicitly instructs the AI to synthesise descriptions in our own voice**, NOT paraphrase Wikipedia. Wikipedia is used as a fact-check, not a content source.
- **Wikipedia images are individually licensed** (usually CC BY-SA / PD). The cache already stores source + page URL; user-facing surfaces that show these images must surface attribution. Out of scope for V1 since no user-facing reads from `plant_library` yet — but flagged for the future "wire into reads" follow-up.

### Disclaimer requirement

Care info is AI-generated guidance, not professional horticultural advice. Toxicity / edibility especially needs "consult a vet / poison control / botanist". Standard for the category — every comparable app has this. The existing legal page (`/legal` or similar) will gain a short paragraph. Not blocking V1.

### Prompt rules baked into the verifier

- "Write `description` in your own words. Do not copy or paraphrase Wikipedia sentences. Use Wikipedia only to check our facts."
- "If a field in our row conflicts with the online sources, propose a corrected value drawn from MULTIPLE sources where possible."
- "When citing a source in the `sources` array, include the URL and the licence string (e.g., 'CC BY-SA 4.0', 'CC0', 'Public Domain')."

### `sources` payload shape

```jsonc
{
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Solanum_lycopersicum",
      "title": "Solanum lycopersicum",
      "source": "wikipedia",
      "licence": "CC BY-SA 4.0",
      "accessed_at": "2026-05-22T03:14:00Z"
    },
    {
      "url": "https://api.gbif.org/v1/species/2930242",
      "title": "GBIF taxonomy backbone — Solanum lycopersicum",
      "source": "gbif",
      "licence": "CC0",
      "accessed_at": "2026-05-22T03:14:00Z"
    }
  ]
}
```

## Schema

### `public.plant_library`

Mirrors `plants` with the per-home / per-provider / fork fields stripped, plus four new columns to track the verification lifecycle.

```sql
CREATE TABLE public.plant_library (
  id                  bigserial PRIMARY KEY,
  common_name         text NOT NULL,
  scientific_name     jsonb NOT NULL DEFAULT '[]'::jsonb,
  other_names         jsonb NOT NULL DEFAULT '[]'::jsonb,
  family              text,
  plant_type          text,
  cycle               text,
  image_url           text,
  thumbnail_url       text,
  watering            text,
  watering_benchmark  jsonb,
  sunlight            jsonb NOT NULL DEFAULT '[]'::jsonb,
  care_level          text,
  hardiness_min       text,
  hardiness_max       text,
  is_edible           boolean DEFAULT false,
  is_toxic_pets       boolean DEFAULT false,
  is_toxic_humans     boolean DEFAULT false,
  attracts            jsonb NOT NULL DEFAULT '[]'::jsonb,
  description         text,
  maintenance_notes   text,
  cones               boolean DEFAULT false,
  cuisine             boolean DEFAULT false,
  dimensions          jsonb NOT NULL DEFAULT '{}'::jsonb,
  drought_tolerant    boolean DEFAULT false,
  edible_leaf         boolean DEFAULT false,
  flowering_season    jsonb NOT NULL DEFAULT '[]'::jsonb,
  flowers             boolean DEFAULT false,
  fruits              boolean DEFAULT false,
  growth_rate         text,
  harvest_season      jsonb NOT NULL DEFAULT '[]'::jsonb,
  indoor              boolean DEFAULT false,
  invasive            boolean DEFAULT false,
  leaf                boolean DEFAULT true,
  maintenance         text,
  medicinal           boolean DEFAULT false,
  origin              jsonb NOT NULL DEFAULT '[]'::jsonb,
  pest_susceptibility jsonb NOT NULL DEFAULT '[]'::jsonb,
  propagation         jsonb NOT NULL DEFAULT '[]'::jsonb,
  pruning_count       jsonb NOT NULL DEFAULT '{}'::jsonb,
  pruning_month       jsonb NOT NULL DEFAULT '[]'::jsonb,
  salt_tolerant       boolean DEFAULT false,
  seeds               boolean DEFAULT false,
  soil                jsonb NOT NULL DEFAULT '[]'::jsonb,
  thorny              boolean DEFAULT false,
  tropical            boolean DEFAULT false,
  watering_max_days   integer,
  watering_min_days   integer,
  growth_habit        text,
  days_to_harvest_min integer,
  days_to_harvest_max integer,
  soil_ph_min         numeric(4,2),
  soil_ph_max         numeric(4,2),
  planting_instructions jsonb,
  -- ── Verification lifecycle ──
  valid               boolean,                     -- null = unverified, true = matched, false = amended
  sources             jsonb,                       -- [{ url, title, source: 'wikipedia'|'gbif', accessed_at }]
  seeded_at           timestamptz NOT NULL DEFAULT now(),
  verified_at         timestamptz,
  seeded_by_run_id    uuid,                        -- FK back to plant_library_runs
  verified_by_run_id  uuid,
  scientific_name_key text GENERATED ALWAYS AS (
    lower(trim(both from regexp_replace(
      COALESCE(NULLIF((scientific_name->>0), ''), common_name),
      '\s+', ' ', 'g'
    )))
  ) STORED
);

CREATE UNIQUE INDEX plant_library_sci_key_idx
  ON public.plant_library (scientific_name_key);

-- Drives the "next batch to verify" query.
CREATE INDEX plant_library_unverified_idx
  ON public.plant_library (seeded_at)
  WHERE verified_at IS NULL;

-- RLS: authenticated read, service-role only write (cron + admin-triggered runs use service key).
ALTER TABLE public.plant_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plant_library read" ON public.plant_library
  FOR SELECT TO authenticated USING (true);
```

### `public.plant_library_runs`

```sql
CREATE TABLE public.plant_library_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text NOT NULL CHECK (kind IN ('seed','verify')),
  triggered_by        uuid REFERENCES auth.users(id),  -- null = cron
  count_requested     integer NOT NULL,
  count_inserted      integer NOT NULL DEFAULT 0,
  count_skipped       integer NOT NULL DEFAULT 0,      -- duplicates
  count_matched       integer NOT NULL DEFAULT 0,
  count_amended       integer NOT NULL DEFAULT 0,
  count_failed        integer NOT NULL DEFAULT 0,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  status              text NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running','succeeded','failed','partial')),
  error_message       text
);

-- Admin UI polls this table; tight idx on started_at desc.
CREATE INDEX plant_library_runs_started_idx ON public.plant_library_runs (started_at DESC);

ALTER TABLE public.plant_library_runs ENABLE ROW LEVEL SECURITY;
-- Only admins read run history.
CREATE POLICY "plant_library_runs admin read" ON public.plant_library_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles up WHERE up.uid = auth.uid() AND up.is_admin = true)
  );
```

## Edge functions

### `seed-plant-library`

**Trigger paths**: cron (daily 02:00 UTC) AND admin-triggered.

**Request body**: `{ count: number, triggered_by?: uuid }` — count clamped to [1, 5000].

**Flow**:

1. Insert a `plant_library_runs` row with `kind = 'seed'`, `status = 'running'`, `count_requested = count`. Capture `run_id`. **Return `{ run_id }` to the caller immediately** — the rest runs in the function but the HTTP response doesn't wait. (Done via `EdgeRuntime.waitUntil` so the connection closes after the insert.)
2. Loop in batches of 25:
   - Ask Gemini for 25 plants in JSON shape `{ common_name, scientific_name, plant_type }` of varying families/types. System prompt explicitly says "do NOT repeat plants from these recent additions: [last 50 sci_keys]" to bias toward novelty (the unique index still backstops actual dupes).
   - For each plant, fan out two AI calls in parallel:
     - `generate_care_guide` (existing Gemini action used by `careGuideToPlantDetails`)
     - `plant-image-search` (reuse for `count: 1` thumbnail; the new `plant_image_cache` makes repeat lookups free)
   - Build the insert row from the care guide. Set `seeded_by_run_id = run_id`, `valid = null`.
   - `INSERT … ON CONFLICT (scientific_name_key) DO NOTHING`. Count actual inserts vs skipped.
3. After every batch, `UPDATE plant_library_runs SET count_inserted, count_skipped` so the admin UI sees live progress.
4. When done, `UPDATE … SET status = 'succeeded', finished_at = now()`. On exception, `status = 'failed', error_message = ?`.

**AI cost guardrails**: chunked 25 at a time, ~40 chunks per 1000-plant run, ~1.5s per chunk → ~60s for the seed phase. Well inside edge function background limits.

### `verify-plant-library`

**Trigger paths**: cron (daily 04:00 UTC) AND admin-triggered.

**Request body**: `{ count: number, triggered_by?: uuid }` — defaults to "all unverified".

**Flow**:

1. Insert `plant_library_runs` row, kind = 'verify'. Return `run_id`.
2. `SELECT * FROM plant_library WHERE verified_at IS NULL ORDER BY seeded_at ASC LIMIT count`.
3. Loop in batches of 10. For each plant:
   - Fetch **Wikipedia summary** (existing `_shared/wikipedia.ts` helpers, or a small fetch). On miss, fall through to step (c) with just GBIF.
   - Fetch **GBIF species lookup** — `https://api.gbif.org/v1/species/match?name=<scientific_name>` returns the accepted taxonomy + canonical scientific name. Free, no key.
   - Send to Gemini with a structured-output schema:
     ```
     prompt: "Compare our plant data to the external sources. If our data is consistent, return { verdict: 'matched' }. Otherwise return { verdict: 'amended', updates: { …fields to overwrite… }, sources: [ { url, title, source } ] }."
     ```
   - On `matched`: `UPDATE plant_library SET valid = true, verified_at = now(), verified_by_run_id = run_id WHERE id = ?`.
   - On `amended`: `UPDATE plant_library SET <fields from updates>, valid = false, sources = ?, verified_at = now(), verified_by_run_id = run_id WHERE id = ?`.
   - Increment counters on the run row.
4. Status flips to `succeeded` (or `partial` if some failed) at the end.

**Safety net**: if a verify call throws (network blip / AI quota), we `count_failed++` for that plant and leave `verified_at` null. Next run picks it up.

## Cron

Two new cron jobs (pg_cron extension already wired):

```sql
-- 02:00 UTC: seed 1000 plants
SELECT cron.schedule(
  'plant-library-seed-daily',
  '0 2 * * *',
  $$SELECT net.http_post(
     url := 'https://<project>.supabase.co/functions/v1/seed-plant-library',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'Authorization', 'Bearer ' || current_setting('app.service_role_key')
     ),
     body := jsonb_build_object('count', 1000)
   )$$
);

-- 04:00 UTC: verify whatever's still unverified
SELECT cron.schedule(
  'plant-library-verify-daily',
  '0 4 * * *',
  $$… body := jsonb_build_object('count', 2000)$$  -- enough to catch up
);
```

## Admin UI

### New entry in `UserProfileDropdown`

A row that only renders when `isAdmin === true`. Label: "Plant Library Admin", icon `Library`. Routes to `/admin/plant-library`.

### `/admin/plant-library` page

`src/components/admin/PlantLibraryAdmin.tsx`. Lazy-loaded. Guarded — redirects non-admins to `/dashboard`.

Layout:

1. **Stats strip** (top, 5 stat cards):
   - Total plants in library
   - Verified (valid = true OR false)
   - Valid (AI matched online sources)
   - Amended (required corrections)
   - Unverified (queued for next verify run)
2. **Run controls** (card):
   - Number input "Plants to seed" (default 100, max 5000).
   - "Run seed" button — fires `seed-plant-library` with the count, gets back `run_id`, optimistically inserts a row at the top of recent-runs with `status='running'`.
   - "Run verify" button — fires `verify-plant-library` (no count input; processes all unverified). Same optimistic add.
3. **Recent runs** (table, last 20 rows from `plant_library_runs`):
   - Columns: started_at, kind, requested, inserted/matched, skipped, amended, failed, duration, triggered_by.
   - Polls every 3s while any row has `status = 'running'`, then stops.

No realtime channel needed; polling is fine for an admin page.

## Files

| File | Purpose |
|------|---------|
| `supabase/migrations/<ts>_plant_library.sql` | NEW — `plant_library` + `plant_library_runs` tables, RLS, indexes |
| `supabase/migrations/<ts>_plant_library_crons.sql` | NEW — pg_cron schedules |
| `supabase/functions/seed-plant-library/index.ts` | NEW — seed edge fn |
| `supabase/functions/seed-plant-library/config.toml` | NEW — `verify_jwt = false` only if cron calls without auth; otherwise service-role |
| `supabase/functions/verify-plant-library/index.ts` | NEW — verify edge fn |
| `supabase/functions/_shared/gbif.ts` | NEW — thin client for GBIF species/match |
| `src/components/admin/PlantLibraryAdmin.tsx` | NEW — admin page |
| `src/services/plantLibraryAdminService.ts` | NEW — fetch totals + recent runs, trigger seed/verify |
| `src/components/UserProfileDropdown.tsx` | Add admin link |
| `src/App.tsx` | Register `/admin/plant-library` route |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Add the two new fns |
| `docs/app-reference/99-cross-cutting/11-cron-jobs.md` | Add the two new crons |
| `docs/app-reference/07-management/<n>-plant-library-admin.md` | NEW — admin reference (Role 1 + Role 2) |

## Risks / open considerations

- **AI hallucinating plants**. Verification catches it — `valid = false` with empty `sources` (no Wikipedia + no GBIF match) is a strong "this might not be a real plant" signal. Admin UI could later expose this as a separate counter; for V1 it just shows up in the amended count.
- **Verification cost**. 1000 verify calls/day at Gemini Flash is ~$0.50. Comfortable.
- **GBIF rate limits**. They're generous (no auth required, anecdotally ~10 req/s sustained). Batches of 10 with small sleeps between is well under.
- **Cold-start lag** on first daily cron — running `seed → verify` back-to-back saves ~2s. We split them because a slow verify shouldn't block the next day's seed; the schedule is fixed-time per kind.
- **What if Wikipedia is down**. Verification with GBIF only is still useful — confirms taxonomy but not care info. AI prompt is structured so it can return `'amended'` based on a single source.

## Out of scope for V1

- **Hooking the library into the existing AI catalogue path** (the `plants` table with `source = 'ai'`, `home_id IS NULL`). The user explicitly said "eventually". V1 only populates.
- **Re-verification of already-verified rows**. We don't re-check `valid = true` rows. A follow-up "refresh stale" pass (90 days) can be added like the existing `refresh-stale-grow-guides` cron.
- **Pruning bad rows from the library**. If a plant is hallucinated and verification fails, the row stays with `valid = false` and empty `sources`. Admin UI doesn't yet expose a delete affordance.
- **Internationalised verification sources**. Wikipedia English-only for V1. If we expand, the second source could rotate language.

## Sequencing

1. Migrations (locally first, then push remote after explicit OK).
2. `gbif.ts` shared client + unit tests.
3. `seed-plant-library` edge fn + manual smoke test (count = 10).
4. `verify-plant-library` edge fn + manual smoke test on the seeded 10.
5. Admin page + service + dropdown entry. Manual end-to-end test as admin.
6. Cron schedules.
7. App-reference docs.
8. Release notes + deploy.
