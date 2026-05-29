# Edge Functions — Catalogue

> Every Supabase Edge Function in the Rhozly stack, what it does, who calls it, and how it gates.

---

## Quick Summary

Edge functions live in `supabase/functions/<name>/index.ts` and share `_shared/` utilities (weather rules, pattern detectors, Gemini wrapper, etc.). They are the only place AI / external API calls happen — the browser never calls Gemini or Open-Meteo directly.

---

## Function reference

### AI — Plant Doctor / Identification

| Function | Trigger | Purpose |
|----------|---------|---------|
| `plant-doctor` | Browser (PlantDoctor screen + LocalizedTaskCalendar + GrowGuideTab + SeasonalPicksCard) | Multi-action: identify / diagnose / pest / **analyse_comprehensive** / **lookup_frost_dates** / **plant_when_to_plant** / **generate_grow_guide** / **seasonal_picks** / search_plants_text / generate_care_guide. Grow Guide action added for the Grow Guide tab — single Gemini call returns the 9-section comprehensive guide envelope (water / soil / sunlight / propagation / germination / pruning / flowering / harvesting / senescence). Cached in `plant_grow_guides`; on cache hit returns existing without Gemini. **Mobile Quick Access Wave 3 added `lookup_frost_dates` and `plant_when_to_plant`** — frost dates cached in a new `home_climate` table with a 6-month TTL (open to all tiers; treated as a fact, not a generation); the per-plant guidance is Sage+ only and uses the cached frost dates as context. Server-side `validateFrostPayload` guards against Gemini hallucinations (hemisphere range checks, ordering, growing-season bounds). **Mobile Quick Access Wave 1 added `analyse_comprehensive`** — one Gemini vision call returns identification + health (incl. sunlight check) + pruning + propagation + edibility/ripeness + optional disease + optional pest **plus** a `suggested_tasks` array in the same shape the chat already produces (consumed by `TaskActionButtons`). Reuses the shared `_shared/visionEnvContext.ts` `buildEnvBlock` helper extracted from `diagnose` for environmental enrichment. Wave 2 of AI Plant Overhaul added catalogue-aware behaviour: `search_plants_text` returns a sparse `hits` map of matches that already exist in the global AI catalogue (or as a home fork); `generate_care_guide` checks the catalogue before calling Gemini and INSERTs a global AI plants row on cache miss. Post-Wave-7 fixes: (1) on legacy `species_cache` hit, ALSO writes a global catalogue row from the cached payload so the response can return `db_plant_id`; (2) the catalogue lookup falls back to `common_name ILIKE` when the `scientific_name_key` lookup misses (handles the case where the user types a common name but the global is keyed by scientific name); (3) the unique-index race-recovery re-reads with BOTH the user-input-derived key AND the actual scientific-name-derived key + a common_name fallback — eliminates the orphan AI plant case where the catalogue insert silently failed. **Seasonal Picks** added `seasonal_picks` — returns 4-6 personalised "what to grow this week" picks. Cached in `home_seasonal_picks` keyed by `(home_id, ISO_week)`. Sage+ → Gemini via `SEASONAL_PICKS_SCHEMA`; Sprout/Botanist → deterministic `_shared/seasonalPicksFallback.ts` table. Action skips the standard AI gate so non-AI tiers can still receive picks via the fallback path; the orchestrator (`_shared/seasonalPicksHandler.ts`) enforces tier routing internally. Server-side `normaliseSeasonalPicks()` validates the model output before write — malformed picks are trimmed, total capped at 6. The cron `refresh-seasonal-picks` uses the same orchestrator. |
| `plant-doctor-ai` | Browser (Plant Doctor Chat) | Chat with vision + tool calls. |
| `search-plants-ai` | Browser (BulkSearch AI tab) | Text search by name; AI synthesises matches. |
| `plant-image-search` | Browser (DiagnosisImageGallery, MultiImageGallery) | Merged image search across Wikipedia / Pixabay / iNaturalist / Verdantly. |
| `manual-refresh-ai-plant` | Browser ("Refresh Care Guide" button in Plant Edit Modal Care tab) | Sage+ tier-gated, rate-limited per (user, plant). Default window: 7 days (prod). Overridable via `AI_REFRESH_RATE_LIMIT_MINUTES` env var declared in `supabase/config.toml` `[edge_runtime.secrets]`. **Does NOT call Gemini** (since the post-Wave-7 refresh-simplification refactor). Accepts `homePlantId` (or legacy `plantId`) and: resolves the global parent (linking an orphan to an existing global, or promoting the home row's data as a new global), computes the visible-field diff between the home row and the catalogue, applies pending updates to the home row's top-level columns, upserts `user_plant_ack` at the global's `freshness_version`, returns `{ changed, changed_fields, freshness_version, global_plant_id, orphan_healed }`. The daily cron is the only thing that calls Gemini. |
| `refresh-stale-grow-guides` | Cron (daily 03:30 UTC) | Walks `plant_grow_guides` rows whose `last_freshness_check_at` is NULL or older than 90 days. Re-asks Gemini, runs `diffGrowGuide`, bumps `freshness_version` + writes `updated_fields` only when content changed. Batch capped at `STALE_GROW_GUIDE_BATCH_SIZE` (default 25). System-attributed AI usage. |
| `refresh-stale-ai-plants` | Cron (daily 03:00 UTC) | Walks global AI plants (`source='ai' AND home_id IS NULL`) whose `last_freshness_check_at` is NULL or older than 90 days. Re-asks Gemini, runs `diffCareGuide`, bumps `freshness_version` + writes a `plant_care_revisions` row when something changed; otherwise just resets the check timestamp. Batch size from `STALE_CHECK_BATCH_SIZE` env (default 25). System-attributed AI usage (no user/home). Forks are skipped by construction. Added in Wave 4 of AI Plant Overhaul. See also [Cron Jobs](./11-cron-jobs.md). |
| `refresh-seasonal-picks` | Cron (Mondays 04:00 UTC) | Pre-warms `home_seasonal_picks` for every home (via `home_members`) whose current ISO-week row is missing. Calls the shared `generateSeasonalPicksForHome()` orchestrator with `callerUserId: null` so AI usage is attributed at the system level. Skips already-warm rows. Batch size from `STALE_SEASONAL_BATCH_SIZE` env (default 25); 750ms inter-call sleep so Gemini quota doesn't spike. Per-home try/catch — one bad home logs to Sentry, the rest of the batch still runs. **The on-demand `seasonal_picks` action on `plant-doctor` uses the same orchestrator**, so the cron and the user-triggered path produce byte-identical picks. See also [Cron Jobs](./11-cron-jobs.md). |
| `parse-seed-packets` | Browser (BulkPasteSeedPacketsModal — The Nursery) | Sage+ AI bulk-paste parser. Accepts `{ homeId, text }`, runs `requireHomeMembership` + `guardAiByHome` + rate limit, then asks Gemini to extract up to 60 candidate packet rows. Server-side `normalisePackets()` validates dates (rejects garbage years), caps strings, trims to 60 results. Returns `{ packets: ParsedSeedPacket[] }`. Sprout / Botanist hit the client-side regex fallback in `src/lib/parseSeedPackets.ts` (same shape). AI failure on Sage+ silently falls through to the regex on the client so the flow always returns something usable. Input capped at 8000 chars. See [The Nursery](../03-garden-hub/10-nursery.md). |
| `scan-seed-packet` | Browser (ScanSeedPacketModal — The Nursery) | Sage+ Gemini Vision OCR for a single packet photo. Accepts `{ homeId, imageBase64, mimeType?, extraImageBase64?, extraMimeType? }` — the optional second image lets the user capture the back of the packet. Same guard trio as `parse-seed-packets`. Base64 input capped at ~2 MB; the client compresses to ~800px JPEG before sending. Defensive `normaliseScanResult()` rejects garbage dates + strings; downgrades confidence (`high` / `medium` / `low`) when fields are thin; flips `unreadable: true` when Gemini self-reports the image isn't a legible packet. Returns `{ packet, confidence, unreadable? }`. Compressed image is uploaded to the `seed-packet-images` storage bucket by the client AFTER the row is inserted (so the path can include the packet UUID) and the resulting public URL is patched onto `seed_packets.image_url`. See [The Nursery](../03-garden-hub/10-nursery.md). |
| `seed-plant-library` | Cron (daily 02:00 UTC) **+** admin manual trigger | **Self-chunking** multi-source-name + AI-care-data seeder (cap 5000). Each invocation: (1) pulls candidate plant names in parallel from FOUR sources via `_shared/plantNameSources.ts` — Wikipedia categories (curated, popular), iNaturalist (random long-tail page), Wikidata SPARQL (labeled Plantae), GBIF species backbone (accepted Plantae at random offset). iNat/Wikidata/GBIF return scientific names directly so the dedup-key filter skips the per-candidate Wikipedia summary HTTP; (2) **two-stage skip-reduction**: case-insensitive common_name filter + scientific_name_key filter — drops both name + key collisions BEFORE AI is called, eliminating wasted-token skips that mattered once we hit paid tier; (3) splits up-to-CHUNK_SIZE survivors into BATCH_SIZE Gemini batches; (4) calls Gemini with a low-temperature **enrichment-only** prompt; (5) after AI responds, a final post-AI key recheck drops any last colliders before the insert loop. After the chunk completes, the function POSTs `{ count: remaining, run_id }` to its own URL (wrapped in `EdgeRuntime.waitUntil` so the request survives function teardown) to process the next chunk. `verify_jwt = false` is required because both pg_cron AND the self-chain invoke without an auth header. Service-role client is used internally for all writes. See [Plant Library Admin](../07-management/10-plant-library-admin.md). |
| `submit-plant-library-batch` | Admin manual trigger **+** scheduled (via `tick_plant_library_schedules` for `kind='batch'`) | Submits one big batch to Gemini's Batch API (50% off, results in 1-24h). **Gather phase runs in `EdgeRuntime.waitUntil`** so the HTTP response returns immediately — the row appears at `status='submitting'`, work continues in the background, status flips to `pending` once Gemini accepts. **Time-budget gather loop** (up to 120s of the 150s background-task cap, hard max 12 iterations) draws candidates from SIX sources per iteration: Wikipedia categories + iNat (random sampling) + Perenual + Verdantly + Wikidata + GBIF (cursor-based sequential pagination via `plant_library_source_cursors`). **Per-source fresh-rate skip** mutes sources returning <10% fresh names for the rest of a submit. Survivors decorated as `Common Name [Sci]` so AI uses the resolved binomial verbatim. Packs into BATCH_SIZE batch lines, POSTs to `/v1beta/models/{model}:batchGenerateContent`. Fixed model: `gemini-2.5-flash-lite`. Inserts `plant_library_batches` row with `status='submitting'` immediately, upgrades to `pending` once Gemini accepts. Returns 202 with `{ batch_id, estimated_cost_usd, status }`. Cap: 10000 plants per submit. See [Plant Library Admin](../07-management/10-plant-library-admin.md). |
| `poll-plant-library-batches` | Cron (every 5 min) | Walks non-terminal `plant_library_batches` rows (`pending` / `running` / `succeeded`). For each, GETs `/v1beta/{batch_name}` to check Gemini's `JOB_STATE_*`. Updates `last_polled_at` + `status`. When a batch flips to `JOB_STATE_SUCCEEDED`, fetches the inline results, parses each batch line (with the same salvage parser the sync flow uses for truncated responses), drops key-colliders, inserts plants into `plant_library`, creates a `plant_library_runs` row with the full per-model + per-token-type breakdown (cost computed with `{ batch: true }` for the 50% discount), and marks the batch row `processed`. Per-batch failures are isolated — one bad row doesn't kill the rest of the poll cycle. `verify_jwt = false` because pg_cron invokes via `pg_net.http_post` without JWT minting. |
| `verify-plant-library` | Cron (daily 04:00 UTC) **+** admin manual trigger | Picks unverified rows (`verified_at IS NULL`), fetches Wikipedia summary + GBIF taxonomy match via `_shared/plantLibrarySources.ts`, asks Gemini to compare under a tolerance-banded rubric. `verdict='matched'` → `valid=true, verified_at=now()`. `verdict='amended'` → overwrite the diverging fields (`pickAllowedUpdates` keeps the update surgical), set `valid=false`, store cited sources `[{ url, title, source, licence, accessed_at }]`. When neither source returns anything usable we mark the row `valid=true` (default-pass) to avoid churn. Same fire-and-forget pattern as the seeder. Verifier prompt explicitly instructs the AI to synthesise corrected descriptions in our own voice (not paraphrase Wikipedia) so the CC BY-SA share-alike clause doesn't bite. See [Plant Library Admin](../07-management/10-plant-library-admin.md). |

### Postgres RPCs (called via supabase.rpc)

| RPC | Purpose | Trigger |
|-----|---------|---------|
| `fork_ai_plant_for_home(plant_id, home_id, edits, overridden_fields)` | Wave 1 — atomic detach-and-fork (insert + inventory repoint + ack seed). Held for the post-D3 world; not on the active path today. | (none — kept for future) |
| `reset_ai_plant_fork(fork_id)` | Wave 1 — deletes fork + repoints inventory at global + seeds ack. Held for post-D3 world. | (none — kept for future) |
| `revert_ai_plant_fork_in_place(fork_id)` | **Wave 6** — restores fork row in place from its global parent. Used by "Reset to catalogue" button in Plant Edit Modal. SECURITY DEFINER with caller-membership check. | Plant Edit Modal Reset button |

### AI — Planning

| Function | Trigger | Purpose |
|----------|---------|---------|
| `generate-landscape-plan` | NewPlanForm / PlanStaging | Gemini blueprint + cover image. |
| `generate-garden-overhaul` | Planner Dashboard "Overhaul" button | **Sage+ only.** Photo-grounded garden redesign. Takes a photo of the user's current garden + likes/dislikes/wants, runs ONE Gemini Vision call (Pro cascade) to analyse the photo + draft a structured redesign blueprint + 3 distinct image prompts, then N parallel Imagen 4 calls to generate "after" concept images. Inserts `plans` row (kind='overhaul') + `plan_overhaul_inputs` + `plan_overhaul_concepts` rows. Each Imagen call logs to `ai_usage_log` with image_count + image_cost_usd so the audit page surfaces per-image cost. Long-running work runs in `EdgeRuntime.waitUntil`; HTTP returns 202 with plan_id immediately. Context snapshot (home, climate, areas, plants, preferences) stored on `plan_overhaul_inputs.context_used` for debug. Rate-limited via `system_rate_limit_overrides` (defaults: sage 3/hr, evergreen 8/hr). See [Garden Overhaul](../04-planner/09-garden-overhaul.md). |
| `generate-task-from-photo` | AddTaskModal | Photo → task suggestion. |
| `generate-ailment-suggestions` | Watchlist AI add | AI ailment workup. |
| `generate-swipe-plants` | PlantSwipeDeck | Personalised plant suggestions. |
| `smart-plant-scheduler` | PlantAssignment (smart schedules) | Builds tailored care schedules. |
| `optimise-area-ai` | OptimiseTab AI | AI proposal generation. |
| `generate-guide` | Admin Guide Generator | Gemini-authored guides. |
| `companion-planting` | Companion overlay | Companion / antagonist queries. **Cached in `companion_cache`** (key: `verdantly`+id or `ai`+lower(name)): cache hits skip the rate limit; AI results are permanent, Verdantly refreshes after a 30-day TTL, empty results are not cached (so they re-generate). |
| `garden-shape-suggestions` | Garden Layout | Suggest beds/zones from area data. |
| `predict-yield` | YieldTab | Forecast yield from past records. |
| `visualiser-analyse` | PlantCameraView | AR placement feedback. |
| `scan-area` | Area Scan Modal | Full area audit from photo. |
| `analyse-plant-end-of-life` | LifecycleCompleteModal | Sage+ only. Gathers the instance's journal entries, tasks, ailments, area + location details and recent weather snapshot, asks Gemini for `likely_causes` / `prevention_next_time` / `affirmation`, persists the result as a closing journal entry. Returns the structured analysis to the client for presentation in LifecycleAnalysisModal. See [Lifecycle Complete Modal](../08-modals-and-overlays/37-lifecycle-complete.md). |
| `suggest-rotation-plants` | AreaRotationCard (Layer B) | Sage+ only. Reads the area's rotation block + climate + soil + owned plants and asks Gemini for 5–8 plant suggestions with personalised reasoning and `schedulable_tasks`. The client routes each suggestion's tasks through `TaskActionButtons` to land real planting tasks. See [Area Details — Crop Rotation](../03-garden-hub/04-area-details.md). |

### Data

| Function | Trigger | Purpose |
|----------|---------|---------|
| `home-dashboard-stats` | Dashboard | Aggregated home counts (plants, tasks, ailments). |
| `home-location-details` | Location Page, Area Details | AI summary for a location/area. |
| `garden-reports` | Garden Reports | Printable summary docs. |

### Cron / scheduled

| Function | Cadence | Purpose |
|----------|---------|---------|
| `sync-weather` | hourly | Pull Open-Meteo into `weather_snapshots`. |
| `analyse-weather` | hourly | Evaluate weather rules → snapshots / alerts. |
| `generate-tasks` | daily | Materialise blueprint-derived tasks. Uses one grouped query for last-task-per-blueprint and inserts in chunks of 500 (Wave C rewrite). |
| `update-plant-states` | daily | Advance growth states per planted-date rules. |
| `pattern-scan` | every 8h | Run pattern detectors → pattern_hits. Users processed in parallel with concurrency cap of 10; per-pattern hit upserts are batched (Wave C rewrite). |
| `pattern-evaluate` | every 8h, +30 min | Score / dedupe pattern hits → user_insights. |
| `agent-chat` | on demand | Tool-aware extension of Plant Doctor chat. Routes text-only messages through Gemini in function-calling mode; 38 tools across read (14, incl. `optimise_area_schedule`), safe-create (10), structural (6), destructive/bulk (9), gated by confirm cards. Tier-gated daily message quota via `check_ai_message_quota`. See [Agent Tools Catalogue](./35-agent-tools.md). |
| `add-plant-to-library` | on demand (admin) | Enriches a single plant by name via Gemini (reusing the bulk seeder's `buildEnrichmentPrompt` + `seedRowToColumnShape`), dedups against `scientific_name_key`, inserts one `plant_library` row, records a 1-row `plant_library_runs` entry. Powers the admin Plant Library "AI search → Add to Library" flow. See [Plant Library Admin](../07-management/10-plant-library-admin.md). |
| `refresh-behaviour-summary` | weekly | Build per-user AI context summary. |
| `daily-batch-notifications` | daily | Send push / email digests. |
| `weekly-digest` | weekly | Weekly summary email. |
| `purge-stale-species-cache` | weekly | Clear old provider caches. |
| `refresh-stale-ai-plants` | daily | AI Plant Overhaul Wave 4: re-check global AI care guides every ~90 days, write diff-based revisions. |
| `run-automations` | every 1 minute | Fire due watering automations. |
| `integrations-ewelink-sync` | periodic | Refresh device readings. |
| `integrations-ecowitt-poll` | periodic | Ecowitt weather station poll. |
| `integrations-dead-mans-switch` | hourly | Re-arm fail-safes. |

### Integrations

| Function | Trigger | Purpose |
|----------|---------|---------|
| `integrations-ewelink-connect` | Wizard | OAuth + device discovery. |
| `integrations-ewelink-control` | Device Detail modal | Open/close valves. |
| `integrations-ewelink-state` | Polling | Sync state. |
| `integrations-ewelink-sync` | Cron | Periodic state + readings. |
| `integrations-ecowitt-connect` | Wizard | Ecowitt setup. |
| `integrations-ecowitt-webhook` | External POST | Webhook receiver. |
| `integrations-readings-query` | Browser | Generic readings query API. |
| `push-webhook` | Provider POST | Push notification webhook. |

### System

| Function | Trigger | Purpose |
|----------|---------|---------|
| `delete-account` | Delete Account Modal | Cascading purge. |
| `export-user-data` | Data Export Section | GDPR JSON archive. |
| `report-error` | ErrorPage / Logger | Forward unhandled errors. |
| `contact-support` | ContactSupportModal | Forward to support inbox. |
| `app-help` | AppHelpSearch | Bundled help content. |

### Provider proxies

| Function | Trigger | Purpose |
|----------|---------|---------|
| `perenual-proxy` | Browser | Proxy Perenual to hide API key. |
| `verdantly-search` | Browser | Verdantly search. |
| `image-proxy` | Browser | Image rewrite / proxy to bypass CORS or hotlink. |

### Shared (`_shared/`)

| Module | Purpose |
|--------|---------|
| `gemini.ts` | Gemini SDK wrapper |
| `weatherRules/` | Weather rule modules; barrel export via `index.ts` |
| `patterns/` | Pattern detectors |
| `permissions.ts` | Server-side permission resolver |

---

## Role 2 — Expert Gardener's Guide

### Why this matters

When something AI-related fails, knowing which edge function it routes through helps narrow the bug. Most failures the user sees correspond to a single function name in the table above.

### Common workflows

- **Plant Doctor failing:** check `plant-doctor` quotas + Gemini status.
- **Tasks not appearing:** `generate-tasks` cron status.
- **Weather missing:** `sync-weather` / `analyse-weather` cron.

---

## Related reference files

- [Cron Jobs](./11-cron-jobs.md)
- [AI — Gemini](./13-ai-gemini.md)
- [Pattern Engine](./26-pattern-engine.md)
- [Weather](./27-weather.md)
- [Data Model — Integrations](./09-data-model-integrations.md)

## Code references for ongoing maintenance

- `supabase/functions/<name>/index.ts`
- `supabase/functions/_shared/`
