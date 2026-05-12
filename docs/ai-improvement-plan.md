# AI Improvement Plan — Rhozly

Audit date: 2026-05-12  
Scope: All 18 AI call sites across 9 edge functions  
Goals: accuracy, personalisation, performance, reliability

---

## Executive Summary

The AI infrastructure is solid (shared `callGeminiCascade` with model cascade + retries, tier gating, rate limiting, `ai_usage_log`) but personalisation is highly uneven and one function is currently broken. The largest cross-cutting gaps are:

1. **No location/hemisphere/season in most prompts** — `homes.country`, `lat/lng`, `timezone` exist but only 1 of 18 call sites uses them.
2. **No shared user context builder** — every function hand-rolls its own DB queries, leading to inconsistency and drift.
3. **Brittle JSON parsing** — half the call sites use "JSON-in-prompt + regex fence-stripping" instead of `responseSchema`, causing occasional parse failures that surface as 400 errors.
4. **`search-plants-ai` is broken** — wrong `callGeminiCascade` call signature; function is currently non-functional.

---

## Call Site Inventory

| # | Function / Action | Score | Top Missing Context |
|---|---|---|---|
| 1 | `plant-doctor-ai` — chat | 4/5 | Hemisphere/season, weather snapshot, recent user_events, plant species facts |
| 2 | `plant-doctor` — `search_plants_text` | 1/5 | Everything — **delete**, route callers to `search-plants-ai` once fixed |
| 3 | `plant-doctor` — `generate_care_guide` | 1/5 | Hemisphere, target area (indoor/outdoor), climate zone, caching |
| 4 | `plant-doctor` — `recommend_plants` | 4/5 | Hemisphere/season, weather forecast, quiz answers, recent area scans |
| 5 | `plant-doctor` — `identify_vision` | 2/5 | `homes.country`, current month, existing inventory in area |
| 6 | `plant-doctor` — `diagnose` | 2/5 | Last 14d weather, area metrics, recent care events, companion plants |
| 7 | `plant-doctor` — `generate_remedial_plan` | 3/5 | Existing tasks (de-dupe), full diagnosis JSON, weather for spray timing |
| 8 | `plant-doctor` — `identify_pest` / `get_ai_pest_info` / `get_ai_disease_info` | 2/5 | Location, season, affected plants in inventory |
| 9 | `generate-landscape-plan` | 5/5 | Hemisphere/timezone (minor), weather averages, extract prefs from first-pass description |
| 10 | `generate-guide` | 1/5 | User experience level, hemisphere/season, user's relevant plants |
| 11 | `generate-ailment-suggestions` | 2/5 | Location, season, user's plant inventory, preferences (organic-only) |
| 12 | `scan-area` | 4/5 | User preferences, hemisphere/month, recent scans for this area |
| 13 | `visualiser-analyse` | 3/5 | Home location, current month, existing area inventory |
| 14 | `predict-yield` | 3/5 | Area metrics, hemisphere alignment, completed care task count this cycle, historical yield per species |
| 15 | `smart-plant-scheduler` | 4/5 | Climate zone, frost dates, user's behavioural pace (postpone rate) |
| 16 | `generate-swipe-plants` | 4/5 | Hemisphere/month (seasonal relevance), area summary for fit suggestions, swipe-left tag history |
| 17 | `search-plants-ai` | **BROKEN** | Fix call signature first, then inject location/season/inventory |
| 18 | `pattern-evaluate` | 5/5 | User's baseline postpone rate as context for significance |

---

## Part 1 — Critical (Do First)

These are mostly wiring changes with immediate impact.

### C-1: Fix `search-plants-ai` broken call signature

**File:** `supabase/functions/search-plants-ai/index.ts`

Current code calls `callGeminiCascade(apiKey, prompt, RESPONSE_SCHEMA, opts)` but the signature is `(apiKey, fn, messages, opts)`. The function is currently non-functional.

**Fix:**
```typescript
const { text: rawText, usage } = await callGeminiCascade(
  geminiApiKey,
  FN,
  [{ role: "user", parts: [{ text: prompt }] }],
  { temperature: 0.3, responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 800 },
);
```

Also fix the broken `logAiUsage` call — use named options object, not positional args.

**Status:** ☐ Not started

---

### C-2: Migrate all `plant-doctor` actions to `responseSchema`

**File:** `supabase/functions/plant-doctor/index.ts`

All 8 actions (`search_plants_text`, `generate_care_guide`, `recommend_plants`, `identify_vision`, `diagnose`, `generate_remedial_plan`, `identify_pest`, `get_ai_pest_info`, `get_ai_disease_info`) currently use "respond ONLY in JSON" in the prompt plus regex fence-stripping.

Migrate each to a typed `responseSchema` object matching the existing output shape. This:
- Eliminates all fence-stripping code
- Survives model cascade switches where a different model may not honour prompt-only JSON instructions
- Allows retry-on-parse-failure in `callGeminiCascade`

Also lower temperature to `0.2` for `generate_care_guide` (factual data should be deterministic).

**Status:** ☐ Not started

---

### C-3: Wire location + hemisphere + season into every gardening prompt

**Files:** All edge functions under `supabase/functions/`

`homes.country`, `homes.lat`, `homes.lng`, `homes.timezone` exist on the DB but only `smart-plant-scheduler` and `pattern-evaluate` use them.

At minimum, derive and inject for every call site:
```typescript
const hemisphere = lat >= 0 ? "Northern" : "Southern";
const month = new Date().toLocaleString("en-GB", { month: "long", timeZone: timezone ?? "UTC" });
const season = getSeason(hemisphere, new Date());
// → "Northern Hemisphere, May 2026 (Spring)"
```

Add `getSeason(hemisphere, date)` to `_shared/dateUtils.ts`.

**Status:** ☐ Not started

---

## Part 2 — Important (Next Sprint)

### I-1: Build `_shared/userContext.ts`

A single shared module that all edge functions call to load and render user context. Eliminates ~400 lines of duplicated SQL across functions.

**Interface:**
```typescript
export interface UserContext {
  userId: string | null;
  homeId: string | null;
  // Identity
  displayName: string | null;
  firstName: string | null;
  subscriptionTier: "sprout" | "botanist" | "sage" | "evergreen" | null;
  // Location
  address: string | null;
  country: string | null;
  timezone: string | null;
  lat: number | null;
  lng: number | null;
  hemisphere: "Northern" | "Southern" | null;
  currentSeason: "Spring" | "Summer" | "Autumn" | "Winter" | null;
  currentMonth: string;
  isoDate: string;
  // Garden
  areas: Area[];
  inventory: InventoryItem[];
  upcomingTasks: Task[];
  // Memory
  preferences: Preference[];
  // Behaviour (from user_behaviour_summary or live aggregation)
  behaviour: BehaviourSummary;
  // Weather
  weather: WeatherSummary | null;
}

export async function buildUserContext(db, opts): Promise<UserContext>
export function renderContextBlock(ctx, sections): string
```

`renderContextBlock` produces a compact, token-efficient text block for system prompts. Full context ≈ 600 tokens.

**Status:** ☐ Not started

---

### I-2: Enrich `diagnose` with environmental context

**File:** `supabase/functions/plant-doctor/index.ts` → `diagnose` action

Currently receives only an image and optional `targetPlant`. This is the highest-leverage single improvement.

**Inject:**
- Last 14 days of weather from `weather_snapshots` → fungal/heat/drought cues
- Area metrics: `indoor/outdoor`, `growing_medium`, `medium_ph`, latest lux reading
- Recent care events for this plant from `user_events` (completed/skipped watering tasks → over/under-water signal)
- Companions in the same area (cross-infection context)
- Plant species facts: `watering`, `cycle`, `care_level`

**Output schema improvements:**
Add `severity`, `likely_causes[]`, `environmental_factors[]`, `immediate_actions[]`, `monitoring_signs[]`.

Add 2 few-shot examples: one healthy plant, one infested.

**Status:** ☐ Not started

---

### I-3: Add `ai_response_cache` table and helper

**Migration:** `supabase/migrations/YYYYMMDDNNNNNN_ai_response_cache.sql`

```sql
CREATE TABLE ai_response_cache (
  cache_key     text PRIMARY KEY,
  function_name text NOT NULL,
  payload       jsonb NOT NULL,
  hit_count     int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX idx_ai_response_cache_expiry ON ai_response_cache (expires_at);
```

**Shared helper:** `supabase/functions/_shared/aiCache.ts`

```typescript
export async function getOrCompute<T>(
  db: SupabaseClient,
  key: string,
  fnName: string,
  ttlDays: number,
  compute: () => Promise<T>,
): Promise<{ result: T; fromCache: boolean }>
```

**Apply to:**

| Function | Cache key | TTL |
|---|---|---|
| `generate_care_guide` | `sha1(plant_name + hemisphere + indoor)` | 30 days |
| `generate-guide` | `sha1(topic + difficulty + audience + hemisphere + month_bucket)` | 7 days |
| `generate-ailment-suggestions` | `sha1(query + country + month_bucket)` | 14 days |
| `search-plants-ai` | `sha1(query + country)` | 7 days |

**Status:** ☐ Not started

---

### I-4: Add fallback content to every user-facing AI call

**File:** `supabase/functions/_shared/fallbacks.ts`

Every AI function should return something useful when all models fail. Never return a 500 to the user.

| Function | Fallback |
|---|---|
| `plant-doctor-ai` chat | `{ reply: "I had trouble thinking that through — could you rephrase?", suggested_plants: [], suggested_tasks: [] }` |
| `generate_care_guide` | Return the species row from `plants` table if it exists |
| `generate-swipe-plants` | Return static seed list of 30 popular plants filtered by hemisphere |
| `predict-yield` | Median of user's past yields for species, `confidence: "low"` |
| `recommend_plants` | Query `plants` table filtered by area `sunlight` value |

**Status:** ☐ Not started

---

### I-5: Apply rate limits to unlimited high-cost endpoints

**File:** `supabase/functions/_shared/rateLimit.ts`

Currently `plant-doctor-ai` (chat) and `generate-landscape-plan` are unlimited. Add rate limiting keyed by subscription tier:

| Tier | AI calls/hour |
|---|---|
| Sprout | 5 |
| Botanist | 20 |
| Sage | 60 |
| Evergreen | unlimited |

Extend `enforceRateLimit` to read `subscription_tier` from `user_profiles` and select the cap.

Also apply limits to: `generate-ailment-suggestions`, `generate-swipe-plants`, `predict-yield`.

**Status:** ☐ Not started

---

### I-6: Standardise preference lookup to `userId` first

**File:** `supabase/functions/plant-doctor/index.ts` → `recommend_plants`

Currently queries `planner_preferences` by `homeId` only. Should prefer `userId` (a user can belong to multiple homes). Fix to match the pattern in `plant-doctor-ai` and `generate-swipe-plants`.

**Status:** ☐ Not started

---

## Part 3 — Enhancements

### E-1: `user_behaviour_summary` nightly rollup

**Migration:** new table `user_behaviour_summary`

```sql
CREATE TABLE user_behaviour_summary (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_days     int  NOT NULL DEFAULT 30,
  tasks_completed int,
  tasks_postponed int,
  tasks_skipped   int,
  postpone_rate   numeric,
  top_task_types  text[],
  plants_added    int,
  ai_chat_count   int,
  last_active_at  timestamptz,
  computed_at     timestamptz NOT NULL DEFAULT now()
);
```

**Edge function:** `supabase/functions/refresh-behaviour-summary/index.ts` — nightly pg_cron job.

Replaces live `user_events` aggregation on every AI call (~100ms saved per request).

**Status:** ☐ Not started

---

### E-2: Climate zone + frost dates on `homes`

**Migration:**
```sql
ALTER TABLE homes
  ADD COLUMN climate_zone text,
  ADD COLUMN frost_first_date date,
  ADD COLUMN frost_last_date date;
```

Derive from `lat/lng` on home creation using a static latitude-band lookup table (stored in `_shared/climateZones.ts`). Consume in `smart-plant-scheduler`, `generate_care_guide`, `recommend_plants`.

**Status:** ☐ Not started

---

### E-3: Streaming responses for long-form generations

**File:** `supabase/functions/_shared/gemini.ts`

Add `callGeminiStream` that returns an `AsyncGenerator` of delta chunks. Apply to:
- `generate-guide`
- `generate-landscape-plan`
- `plant-doctor-ai` chat

Client reads via `fetch` + `getReader()`. Cuts perceived latency from ~7s to first-token in ~500ms.

**Status:** ☐ Not started

---

### E-4: Swipe like/dislike events

**File:** `src/events/registry.ts`

Add `SWIPE_LIKED` and `SWIPE_DISLIKED` event types. Emit from the swipe UI component. Consume in `generate-swipe-plants` to weight tag preferences away from disliked traits.

**Status:** ☐ Not started

---

### E-5: AI feedback events (thumbs up/down)

Add optional thumbs up/down UI to `plant-doctor-ai` chat replies. Emit `AI_REPLY_RATED` event with `{ rating: 1 | -1, function: string, message_id: string }`. Enables future quality monitoring and per-user prompt tuning.

**Status:** ☐ Not started

---

### E-6: Enrich `generate-landscape-plan` (minor)

- Add `hemisphere`, `homes.country`, `current_month` to system prompt (currently absent — affects planting season validity of generated plans).
- Also run `extractPreferencesFromFeedback` on the **initial** form `description`, not just regen feedback. Currently first-pass preferences from "I love roses and hate pests" are never captured if the plan is accepted on the first attempt.

**Status:** ☐ Not started

---

### E-7: Enrich `visualiser-analyse`

- Inject home location + current month (impacts daylight intensity estimation from the camera image).
- Inject existing area inventory so the AI knows what's already planted there.
- Inject user preferences to avoid recommending placements that conflict with known dislikes.

**Status:** ☐ Not started

---

### E-8: Enrich `predict-yield`

- Area metrics: `growing_medium`, `medium_ph`, lux history.
- Hemisphere/season alignment check against `expected_harvest_date`.
- Count of completed Watering/Feeding tasks since `planted_at` (fetched from `tasks`).
- User's historical yield-per-plant average for this species (strong personalisation signal).

**Status:** ☐ Not started

---

### E-9: Gemini cached content prefix

Move the static portions of the `plant-doctor-ai` system prompt (7 task rules + 9 preference detection examples — ~600 tokens) to a Gemini cached content prefix. Saves ~600 input tokens per chat turn at high volume.

**Status:** ☐ Not started

---

## New Files to Create

| File | Purpose |
|---|---|
| `supabase/functions/_shared/userContext.ts` | Shared user context builder (I-1) |
| `supabase/functions/_shared/aiCache.ts` | AI response cache helper (I-3) |
| `supabase/functions/_shared/fallbacks.ts` | Per-function fallback content (I-4) |
| `supabase/functions/_shared/climateZones.ts` | Latitude-band → climate zone lookup (E-2) |
| `supabase/functions/refresh-behaviour-summary/index.ts` | Nightly behaviour rollup (E-1) |
| `supabase/migrations/YYYYMMDD_ai_response_cache.sql` | Cache table (I-3) |
| `supabase/migrations/YYYYMMDD_user_behaviour_summary.sql` | Behaviour rollup table (E-1) |
| `supabase/migrations/YYYYMMDD_homes_climate_zone.sql` | Climate zone columns (E-2) |

---

## Files to Modify

| File | Changes |
|---|---|
| `supabase/functions/search-plants-ai/index.ts` | Fix call signature + logAiUsage (C-1) |
| `supabase/functions/plant-doctor/index.ts` | responseSchema for all actions (C-2), diagnose enrichment (I-2), pref lookup fix (I-6) |
| `supabase/functions/plant-doctor-ai/index.ts` | Weather snapshot, hemisphere/season, plant species facts (C-3 + I-1) |
| `supabase/functions/generate-guide/index.ts` | responseSchema, hemisphere/season, user plants (C-2, C-3) |
| `supabase/functions/generate-ailment-suggestions/index.ts` | Location/season/inventory, caching (C-3, I-3) |
| `supabase/functions/generate-landscape-plan/index.ts` | Hemisphere/timezone/month (E-6) |
| `supabase/functions/scan-area/index.ts` | User prefs, hemisphere/month (C-3) |
| `supabase/functions/visualiser-analyse/index.ts` | Location, area inventory, prefs (E-7) |
| `supabase/functions/predict-yield/index.ts` | Area metrics, behaviour signals (E-8) |
| `supabase/functions/smart-plant-scheduler/index.ts` | Climate zone, frost dates, postpone rate (E-2) |
| `supabase/functions/generate-swipe-plants/index.ts` | Hemisphere/month, swipe tag history (E-4) |
| `supabase/functions/pattern-evaluate/index.ts` | Baseline postpone rate (minor) |
| `supabase/functions/_shared/rateLimit.ts` | Tier-aware caps (I-5) |
| `src/events/registry.ts` | SWIPE_LIKED, SWIPE_DISLIKED, AI_REPLY_RATED events (E-4, E-5) |

---

## Implementation Order

1. **C-1** Fix `search-plants-ai` broken call signature
2. **C-2** Migrate `plant-doctor` actions to `responseSchema`
3. **C-3** Wire location + hemisphere + season into all prompts
4. **I-1** Build `_shared/userContext.ts`
5. **I-2** Enrich `diagnose` with environmental context
6. **I-3** Add `ai_response_cache` + helper
7. **I-4** Add fallback content
8. **I-5** Tier-aware rate limits
9. **I-6** Standardise preference lookup
10. **E-1** Behaviour summary rollup
11. **E-2** Climate zone + frost dates
12. **E-3** Streaming
13. **E-4** Swipe events
14. **E-5** AI feedback events
15. **E-6–E-9** Remaining enrichments

---

## Acceptance Criteria

The AI layer is considered complete when:

- [ ] `search-plants-ai` returns valid structured results
- [ ] All `plant-doctor` actions use `responseSchema` — zero regex fence-stripping in codebase
- [ ] Every AI prompt includes hemisphere + season + country
- [ ] `buildUserContext` used by at least 6 call sites
- [ ] `diagnose` injects weather + care event history
- [ ] `ai_response_cache` in place for `generate_care_guide`, `generate-guide`, `generate-ailment-suggestions`
- [ ] Every AI edge function has a defined fallback — no 500s reaching the user
- [ ] `plant-doctor-ai` and `generate-landscape-plan` rate-limited by tier
- [ ] `npm run test:functions` — 0 failures
