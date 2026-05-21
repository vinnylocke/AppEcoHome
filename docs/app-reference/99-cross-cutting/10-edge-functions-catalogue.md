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
| `plant-doctor` | Browser (PlantDoctor screen + LocalizedTaskCalendar + GrowGuideTab) | Multi-action: identify / diagnose / pest / **analyse_comprehensive** / **lookup_frost_dates** / **plant_when_to_plant** / **generate_grow_guide** / search_plants_text / generate_care_guide. Grow Guide action added for the Grow Guide tab — single Gemini call returns the 9-section comprehensive guide envelope (water / soil / sunlight / propagation / germination / pruning / flowering / harvesting / senescence). Cached in `plant_grow_guides`; on cache hit returns existing without Gemini. **Mobile Quick Access Wave 3 added `lookup_frost_dates` and `plant_when_to_plant`** — frost dates cached in a new `home_climate` table with a 6-month TTL (open to all tiers; treated as a fact, not a generation); the per-plant guidance is Sage+ only and uses the cached frost dates as context. Server-side `validateFrostPayload` guards against Gemini hallucinations (hemisphere range checks, ordering, growing-season bounds). **Mobile Quick Access Wave 1 added `analyse_comprehensive`** — one Gemini vision call returns identification + health (incl. sunlight check) + pruning + propagation + edibility/ripeness + optional disease + optional pest **plus** a `suggested_tasks` array in the same shape the chat already produces (consumed by `TaskActionButtons`). Reuses the shared `_shared/visionEnvContext.ts` `buildEnvBlock` helper extracted from `diagnose` for environmental enrichment. Wave 2 of AI Plant Overhaul added catalogue-aware behaviour: `search_plants_text` returns a sparse `hits` map of matches that already exist in the global AI catalogue (or as a home fork); `generate_care_guide` checks the catalogue before calling Gemini and INSERTs a global AI plants row on cache miss. Post-Wave-7 fixes: (1) on legacy `species_cache` hit, ALSO writes a global catalogue row from the cached payload so the response can return `db_plant_id`; (2) the catalogue lookup falls back to `common_name ILIKE` when the `scientific_name_key` lookup misses (handles the case where the user types a common name but the global is keyed by scientific name); (3) the unique-index race-recovery re-reads with BOTH the user-input-derived key AND the actual scientific-name-derived key + a common_name fallback — eliminates the orphan AI plant case where the catalogue insert silently failed. |
| `plant-doctor-ai` | Browser (Plant Doctor Chat) | Chat with vision + tool calls. |
| `search-plants-ai` | Browser (BulkSearch AI tab) | Text search by name; AI synthesises matches. |
| `plant-image-search` | Browser (DiagnosisImageGallery, MultiImageGallery) | Merged image search across Wikipedia / Pixabay / iNaturalist / Verdantly. |
| `manual-refresh-ai-plant` | Browser ("Refresh Care Guide" button in Plant Edit Modal Care tab) | Sage+ tier-gated, rate-limited per (user, plant). Default window: 7 days (prod). Overridable via `AI_REFRESH_RATE_LIMIT_MINUTES` env var declared in `supabase/config.toml` `[edge_runtime.secrets]`. **Does NOT call Gemini** (since the post-Wave-7 refresh-simplification refactor). Accepts `homePlantId` (or legacy `plantId`) and: resolves the global parent (linking an orphan to an existing global, or promoting the home row's data as a new global), computes the visible-field diff between the home row and the catalogue, applies pending updates to the home row's top-level columns, upserts `user_plant_ack` at the global's `freshness_version`, returns `{ changed, changed_fields, freshness_version, global_plant_id, orphan_healed }`. The daily cron is the only thing that calls Gemini. |
| `refresh-stale-grow-guides` | Cron (daily 03:30 UTC) | Walks `plant_grow_guides` rows whose `last_freshness_check_at` is NULL or older than 90 days. Re-asks Gemini, runs `diffGrowGuide`, bumps `freshness_version` + writes `updated_fields` only when content changed. Batch capped at `STALE_GROW_GUIDE_BATCH_SIZE` (default 25). System-attributed AI usage. |
| `refresh-stale-ai-plants` | Cron (daily 03:00 UTC) | Walks global AI plants (`source='ai' AND home_id IS NULL`) whose `last_freshness_check_at` is NULL or older than 90 days. Re-asks Gemini, runs `diffCareGuide`, bumps `freshness_version` + writes a `plant_care_revisions` row when something changed; otherwise just resets the check timestamp. Batch size from `STALE_CHECK_BATCH_SIZE` env (default 25). System-attributed AI usage (no user/home). Forks are skipped by construction. Added in Wave 4 of AI Plant Overhaul. See also [Cron Jobs](./11-cron-jobs.md). |

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
| `generate-task-from-photo` | AddTaskModal | Photo → task suggestion. |
| `generate-ailment-suggestions` | Watchlist AI add | AI ailment workup. |
| `generate-swipe-plants` | PlantSwipeDeck | Personalised plant suggestions. |
| `smart-plant-scheduler` | PlantAssignment (smart schedules) | Builds tailored care schedules. |
| `optimise-area-ai` | OptimiseTab AI | AI proposal generation. |
| `generate-guide` | Admin Guide Generator | Gemini-authored guides. |
| `companion-planting` | Companion overlay | Companion / antagonist queries. |
| `garden-shape-suggestions` | Garden Layout | Suggest beds/zones from area data. |
| `predict-yield` | YieldTab | Forecast yield from past records. |
| `visualiser-analyse` | PlantCameraView | AR placement feedback. |
| `scan-area` | Area Scan Modal | Full area audit from photo. |

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
| `generate-tasks` | daily | Materialise blueprint-derived tasks. |
| `update-plant-states` | daily | Advance growth states per planted-date rules. |
| `pattern-scan` | hourly | Run pattern detectors → pattern_hits. |
| `pattern-evaluate` | hourly | Score / dedupe pattern hits → user_insights. |
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
