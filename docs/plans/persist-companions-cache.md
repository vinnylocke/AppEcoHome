# Plan — Persist companion data (server-side cache) + fix the rate-limit breakage

## Problem
1. **Broken now:** the Companions tab fails on first open *and* on Retry. Root cause: `companion-planting` has **no persistence**, so every open calls Gemini/Verdantly, and it's only protected by an hourly rate limit (not in `TIER_LIMITS` → default **20/hr** for Sage). My recent client auto-retry doubled calls per open; repeated testing exhausted the limit → every call now 429s.
2. **The ask:** once companions are fetched for a plant, save them so they aren't re-fetched each time — **except Verdantly**, which should cache with a TTL. If no companions were found, fetch again next time.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — `companion-planting`
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md`

## Fix — a server-side `companion_cache`

### 1. Migration `companion_cache`
Global, species-level cache (shareable across users, like `plant_library`). Written/read only by the edge function (service role), so no client grants / RLS policies needed.

```sql
create table public.companion_cache (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,            -- 'verdantly' | 'ai' (api/ai/manual all use the AI/name path)
  cache_key    text not null,            -- verdantly: verdantly_id; else lower(trim(plant_name))
  beneficial   jsonb not null default '[]'::jsonb,
  harmful      jsonb not null default '[]'::jsonb,
  neutral      jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  unique (source, cache_key)
);
alter table public.companion_cache enable row level security;
-- No policies/grants: only the service-role edge function touches it (RLS-bypassed).
```

### 2. `companion-planting` reads/writes the cache
- Compute `(source, cache_key)`: `verdantly` + `verdantly_id`, else `ai` + `lower(trim(plant_name))`.
- **Read first.** On hit:
  - `ai`: **permanent** — return it (AI companion knowledge is stable).
  - `verdantly`: return only if `generated_at` is within the **TTL (30 days)**; else treat as miss.
  - Only treat a hit as valid if it's **non-empty** (≥1 companion) — an empty stored result means "regenerate" (per the ask).
- **On miss/expired/empty:** generate (Gemini or Verdantly API as today), then **upsert** into `companion_cache` *only when non-empty* (so genuinely-empty plants re-call next time rather than caching a blank). Return the fresh result.
- Net effect: the AI/Verdantly call (and the rate limit) is hit **once per plant ever** (or once per 30 days for Verdantly); every later open is an instant DB read.

### 3. Client reliability (`CompanionPlantsTab` + `companionCache`)
- Keep calling `companion-planting` (now cache-backed) + the in-memory promise cache (per-session dedupe).
- **Don't auto-retry on a rate-limit (429) error** — retrying a 429 is pointless and burns the window. Detect "Rate limit" in the error and surface a friendly "try again shortly" message instead of the generic failure; keep the single auto-retry only for genuine transient errors (cold start). With the DB cache, misses (hence AI calls) are now rare, so the limit won't exhaust in normal use.

### 4. (Optional, low-risk) raise the limit
Add `"companion-planting"` to `TIER_LIMITS` (e.g. botanist 20 / sage 40 / evergreen 80). With the cache it's rarely hit, but this prevents a burst of first-time generations from tripping the default.

## Tests
- Deno (`supabase/tests/`): a test for the cache key + hit/miss/empty/TTL branch logic if extractable as a pure helper; otherwise document manual verification.
- Unit: client-side 429 handling if practical.

## App-reference docs
- `10-edge-functions-catalogue.md` — note `companion-planting` now caches in `companion_cache` (AI permanent, Verdantly 30-day TTL, empties not cached).
- `12-senescence.md` / companions notes — companions now persist; first open generates, later opens are instant.

## Migration workflow
Apply locally first (`supabase migration up`), then `supabase db push` only on your go-ahead (the deploy script runs `db push`).

## Risks
- New table + edge-fn logic. Service-role-only so no RLS exposure. Empty results intentionally not cached (rare extra calls). Verify on device.

## Open decision
Verdantly TTL — **30 days** proposed (companion data is fairly static). Adjust if you'd prefer shorter/longer.

## Deploy
Migration + edge fn → `npm run deploy` (db push + functions deploy), then push to `main`.
