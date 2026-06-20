# AI Audit & Improvement Plan — making AI central, personal, and observable

## Goal (from the request)

Make AI the **most useful tool in the user's arsenal**: central, *learning about the
customer*, and giving **accurate, personalised, specific** help. Rate every AI feature
/100, write an improvement plan for anything **< 90**, audit the **context** we feed the
models (and whether we can give more/better), and add **logging** so every AI call stores
an **accurate cost** plus the **context + prompt + raw result** for review.

## Method + app-reference consulted

- `99-cross-cutting/13-ai-gemini.md` (Gemini wiring, cascade, pricing, context injection),
  `10-edge-functions-catalogue.md` (function list), `17-tier-gating.md`, `26-pattern-engine.md`,
  `12-notifications.md`, `06-account/01-account-tab.md` (AI Usage panel), the Audit Log ref.
- Read the AI infrastructure end-to-end: `_shared/gemini.ts` cascade, `_shared/geminiCost.ts`
  (accurate pricing), `_shared/aiUsage.ts` (`logAiUsage`), `_shared/gardenContext.ts`,
  `_shared/userContext.ts`, `agent-chat/context.ts`.
- **Coverage maps** (grep-derived): 37 functions call Gemini; 27 call `logAiUsage`; only
  ~5 use the rich shared context (`buildUserContext`/`buildGardenContext`).

> Scoring basis: scores weight **personalisation, context richness, and observability**
> highest (your stated priorities), then usefulness, accuracy, learning, and cost integrity.
> They're assessed from architecture + documented behaviour + the coverage maps. The
> implementation phase deep-reads each function's prompt to confirm/refine before changes.

---

## Rubric (each metric /100)

| Metric | What it measures |
|--------|------------------|
| **Usefulness** | Does it solve a real gardening job well? |
| **Personalisation** | Does it use *this* user's garden / climate / history / preferences? |
| **Context richness** | How much relevant grounding it gets vs what's available |
| **Accuracy & specificity** | Structured output, grounded facts, specific (not generic) answers |
| **Learning** | Does it adapt to the user over time (behaviour, preferences, feedback)? |
| **Cost logging** | Is an *accurate* per-call cost stored in the DB? |
| **Observability** | Are the context + prompt + raw result captured for review? |

**Overall** = personalisation ×2, context ×2, usefulness ×1.5, accuracy ×1.5, learning ×1,
cost ×1, observability ×1, normalised to 100.

---

## The five cross-cutting findings (these drag almost every score down)

1. **Context reach is narrow.** The rich context builders are excellent — `buildUserContext`
   gives identity, location, **climate + frost**, garden, upcoming tasks, **preferences**,
   **30-day behaviour** (completed/postponed/skipped/postpone-rate/top types), and **weather**
   (7-day + frost/heatwave). `buildGardenContext` adds the whole-garden snapshot + crop
   rotation. **But only ~5 functions use them.** ~30 AI features run on the immediate input
   alone (a plant name, a photo) — no garden, no climate, no history. This is the single
   biggest lever for "personal + specific".

2. **The cost figure stored in the DB is wrong for most calls.** `geminiCost.ts`
   (`estimateGeminiCostUsd`) is accurate — separate input/output/cache/thoughts rates for all
   9 models + batch discount. But `logAiUsage` (what writes `ai_usage_log`) ignores it and uses
   a **crude flat per-token rate over only 4 models** (default `0.0000003`). A `gemini-2.5-pro`
   vision call (input $1.25 / output $10 per 1M) is logged at a flat $0.30/1M — wildly off. Every
   "Est. cost" you see is therefore unreliable.

3. **Cost coverage has holes.** 37 functions call Gemini; ~8–10 never write `ai_usage_log`
   (e.g. `companion-planting`, `pattern-evaluate`, `generate-ailment-suggestions`'s siblings
   `seed/verify-ailment-library`, `suggest-plant-names`, `add-plant-to-library`). The Plant
   Library seed/verify/batch funcs DO track cost — but in a *separate* table
   (`plant_library_runs`), so there's no single source of truth.

4. **Zero prompt/context/result observability.** Nothing stores what context we built, the
   prompt we sent, or the raw model output. You can't audit *why* an answer was good/bad, or
   whether the context was the problem. This is the missing piece you called out explicitly.

5. **Learning is built but barely wired.** The ingredients exist — `user_events`,
   `user_behaviour_summary` (nightly), the pattern engine (`user_insights`),
   `detected_preferences` (plant-doctor chat writes prefs back). But behaviour/preferences feed
   only the ~5 context-rich functions, and there's **no feedback signal** capturing whether an
   AI output was actually helpful, so nothing compounds.

---

## Ratings — every AI area /100

> P=Personalisation, C=Context, U=Usefulness, A=Accuracy, L=Learning, $=Cost-logging, O=Observability.

| AI area (functions) | P | C | U | A | L | $ | O | **Overall** |
|---------------------|---|---|---|---|---|---|---|-------------|
| **Garden AI Assistant** (`agent-chat`) | 70 | 72 | 90 | 85 | 35 | 70 | 40 | **72** |
| **Plant Doctor — vision** (`plant-doctor` identify/diagnose/pest/analyse) | 60 | 65 | 92 | 88 | 25 | 75 | 35 | **70** |
| **Plant Doctor — chat** (`plant-doctor-ai`) | 85 | 85 | 88 | 85 | 70 | 80 | 35 | **80** |
| **AI Area Coach** (`area-sensor-analysis`) | 82 | 85 | 85 | 85 | 40 | 80 | 40 | **78** |
| **Garden Overhaul** (`generate-garden-overhaul`) | 85 | 88 | 85 | 80 | 40 | 80 | 55 | **79** |
| **Landscape Plan** (`generate-landscape-plan`) | 85 | 85 | 85 | 82 | 40 | 80 | 35 | **78** |
| **Swipe / plant recs** (`generate-swipe-plants`, `suggest-rotation-plants`) | 80 | 82 | 80 | 80 | 45 | 75 | 35 | **74** |
| **Yield prediction** (`predict-yield`) | 70 | 72 | 80 | 80 | 30 | 80 | 35 | **70** |
| **Smart scheduler** (`smart-plant-scheduler`) | 65 | 68 | 82 | 80 | 30 | 80 | 35 | **68** |
| **Care guides** (`generate-guide`, care-guide gen, `refresh-stale-grow-guides`) | 45 | 55 | 85 | 85 | 20 | 75 | 35 | **63** |
| **Area Scan** (`scan-area`) | 45 | 50 | 85 | 82 | 20 | 80 | 35 | **61** |
| **Optimise area** (`optimise-area-ai`) | 60 | 65 | 80 | 80 | 35 | 80 | 35 | **66** |
| **Companion planting** (`companion-planting`) | 35 | 45 | 80 | 80 | 15 | 30 | 30 | **53** |
| **Ailment suggestions** (`generate-ailment-suggestions`) | 50 | 55 | 82 | 80 | 20 | 75 | 35 | **62** |
| **Pattern engine** (`pattern-evaluate`) | 85 | 80 | 78 | 75 | 80 | 30 | 35 | **70** |
| **Visualiser analyse** (`visualiser-analyse`) | 40 | 45 | 75 | 78 | 15 | 80 | 35 | **57** |
| **Task from photo** (`generate-task-from-photo`) | 45 | 50 | 78 | 80 | 20 | 80 | 35 | **60** |
| **Search plants (AI)** (`search-plants-ai`) | 40 | 45 | 78 | 80 | 25 | 75 | 35 | **57** |
| **App Help** (`app-help`) | 35 | 60 | 78 | 80 | 15 | 75 | 35 | **58** |
| **End-of-life analysis** (`analyse-plant-end-of-life`) | 60 | 62 | 78 | 80 | 20 | 75 | 35 | **64** |
| **Plant naming/parse** (`suggest-plant-names`, `parse-plant-list`, seed-packet) | 35 | 45 | 78 | 82 | 10 | 50 | 35 | **55** |
| **Plant Library seed/verify** (`seed/verify-plant-library`, batch) — *backend* | 60 | 70 | 80 | 88 | 30 | 90 | 70 | **74** |

**Everything is < 90.** The ceiling today is ~80 (Plant Doctor chat) because even the best
features lack observability + a feedback loop, and the floor (~53–61) is dominated by
context-poor, single-shot calls. No feature is "personal + learning + observable" end-to-end.

---

## Improvement plans (grouped — most share the same levers)

### Lever A — "Context enrichment" (lifts P + C + A across ~15 features) ⭐ biggest win

Make the rich context the **default**, not the exception. Concretely:

- Add a **thin, cached `getUserContext` accessor** (wrap `buildUserContext`, 5-min per-user
  cache like `agent-chat/context.ts`) and inject the relevant **sections** into every
  user-facing AI call. Most need only a subset (token-cheap):
  - **Care guides / Search / Plant naming / Companion / Ailments / Task-from-photo** → add
    `location + climate + season + hemisphere` (so advice is *"for your zone, sow X in March"*
    not generic) and, where a plant is named, whether it's **in their Shed** + its area's
    sun/medium/pH. Care guides at 45 P is the worst offender for a flagship surface.
  - **Area Scan / Optimise / Visualiser** → inject the **area's** sun/medium/pH/existing plants
    + climate (they're area-scoped but currently context-thin).
  - **Yield / Smart scheduler** → add behaviour (postpone rate → don't over-schedule) +
    weather + climate.
- **Agent Assistant**: extend `agent-chat/context.ts` with the missing grounding —
  **climate + frost window, current weather + 7-day risk, season, top preferences, 30-day
  behaviour** (postpone rate already gives a "keep it brief" steer). It has the tools to fetch
  detail; it lacks the ambient grounding to be *proactive and seasonal*.
- **Plant Doctor vision**: pass the user's **climate + the plant's history/area** into
  diagnosis so "why is my tomato yellowing" is answered against *their* conditions.

*Per-feature target after Lever A: +15–25 overall.*

### Lever B — Observability + accurate cost (lifts $ + O across ALL features) ⭐ your explicit ask

See the design section below. Single shared `logAiCall()` that every AI function calls:
accurate cost (`estimateGeminiCostUsd`) + stored context + prompt + raw result. Retire the
crude costing in `logAiUsage`. *Per-feature: $ → 90+, O → 85+.*

### Lever C — Learning loop (lifts L across ALL features)

- **Capture a quality signal.** Add lightweight feedback on AI outputs (👍/👎 + optional
  "why" on diagnoses, guides, plans, chat replies) → `ai_feedback` keyed to the `ai_call_log`
  row. This is the missing compounding signal.
- **Feed preferences + behaviour back.** Generalise `plant-doctor-ai`'s `detected_preferences`
  write-back so any conversational surface can persist learned preferences; inject
  `user_preferences` + behaviour summary into the context pack (Lever A) so the app visibly
  "remembers".
- **Close the pattern-engine loop**: surface `user_insights` into the assistant's context so
  chat can reference detected patterns ("you've postponed watering 4× — want a lighter
  schedule?").

### Per-area specifics (only where beyond the generic levers)

- **Companion planting (53)** — lowest. Add cost logging (currently none), inject the user's
  actual bed neighbours + climate so suggestions are about *their* layout, not a generic pair list.
- **Care guides (63)** — flagship, weak personalisation. Anchor every guide to the user's
  hemisphere/zone/frost dates (the data exists in `home_climate`) and their Shed instance.
- **Pattern engine (70)** — strong P/L, but no cost logging and its insights don't reach other
  surfaces. Wire cost logging + expose insights to the assistant.
- **Plant naming/parse/seed-packet (55)** — utility calls; cheap wins: cost logging + locale/
  climate hint so "courgette vs zucchini" and regional names resolve correctly.

---

## AI Observability & Cost system (the logging build — your explicit ask)

### New table `ai_call_log` (one row per Gemini/Imagen call)

```sql
create table public.ai_call_log (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid,
  home_id         uuid,
  function_name   text not null,
  action          text,
  model           text not null,
  -- token + cost (accurate, via estimateGeminiCostUsd)
  prompt_tokens   int  not null default 0,
  cached_tokens   int  not null default 0,
  output_tokens   int  not null default 0,   -- candidates + thoughts
  thoughts_tokens int  not null default 0,
  image_count     int  not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  duration_ms     int,
  status          text not null default 'ok',   -- ok | error | fallback
  -- observability payloads (the part you asked for)
  context_block   text,    -- the grounding context we built
  prompt          text,    -- the full prompt/messages sent
  raw_result      jsonb,   -- raw model response (trimmed of base64 image bytes)
  error           text
);
-- RLS: admins read all; a user reads their own. Service-role writes.
```
- **Retention/size:** truncate `prompt`/`raw_result`/`context_block` to a cap (e.g. 16 KB each),
  strip Imagen base64 bytes, and a cron prunes rows > N days (configurable) so it doesn't bloat.
- Keep `ai_usage_log` as the lightweight aggregate the AI Usage panel already reads (or migrate
  it to read `ai_call_log`); `ai_call_log` is the deep audit record.

### Shared helper `_shared/aiLog.ts` — `logAiCall(db, { ... })`

Every AI function calls this once per model call. It:
1. Computes cost with **`estimateGeminiCostUsd`** (text/vision) or `estimateImagenCostUsd`
   (images) — never the crude flat rate.
2. Inserts the full `ai_call_log` row (context/prompt/raw result + tokens + duration + status).
3. Best-effort, never throws (an audit insert must not break the feature).

Then **sweep all 37 callers** to use it (replacing/augmenting `logAiUsage`), closing the
coverage holes in one pass. `geminiCost.ts` stays the billing-math authority;
`src/lib/geminiPricing.ts` stays in sync for the admin table.

### Admin surface

Extend the existing **Audit page / Plant Library admin** with an **AI calls** view: filter by
function/user/date, see cost, and expand a row to read the **context → prompt → raw result**.
This is the "thoroughly check it" tool.

### Stripe cost mirror (per-customer cost-to-serve)

The DB (`ai_usage_log`) is the complete, accurate ledger for **all** users (incl. free users
with no Stripe customer). To surface each customer's AI cost in Stripe:

- **Recommended — nightly cron → Customer metadata.** A `sync-stripe-ai-cost` cron rolls up
  `ai_usage_log` per user and writes onto each `stripe_customer_id`'s **Customer metadata**:
  `ai_cost_usd_30d`, `ai_cost_usd_total`, `ai_calls_30d`, `ai_cost_updated_at`. Cost-to-serve
  shows right on the customer in Stripe, next to their subscription. Once/day, readable, no
  per-call Stripe traffic. Only users who've created a Stripe customer appear; the DB + admin
  view cover everyone.
- **Alternative — Stripe Billing Meters.** A meter event per call
  (`event_name: ai_cost`, `payload: { stripe_customer_id, value }`) for real-time, billing-grade
  usage + a path to charging AI overages. More traffic + raw integer sums.

Default: the nightly-metadata cron. Both read the same DB ledger, so meters can be added later
without rework.

---

## Suggested phasing

1. **Phase 1 — Observability + cost truth** (Lever B): `ai_call_log` + `logAiCall` + accurate
   cost + sweep all callers + admin view. *Unlocks measuring everything else; fixes your cost
   concern immediately.*
2. **Phase 2 — Context enrichment** (Lever A): shared cached `getUserContext` accessor +
   inject into the context-poor features (care guides, area scan, companion, search, naming,
   task-from-photo, optimise, visualiser) + enrich the assistant. *Biggest score lift.*
3. **Phase 3 — Learning loop** (Lever C): `ai_feedback` + preference write-back generalisation
   + surface pattern insights into chat.
4. **Phase 4 — Re-score** against the rubric using real `ai_call_log` data (now we can measure
   cost + read prompts) and tune prompts on the worst performers.

## Tests + docs (per change, when we implement)

- Deno unit tests for `logAiCall` cost math (mirror `aiUsage.test.ts`) + the context pack
  section selection.
- Update `13-ai-gemini.md` (new logging contract), `10-edge-functions-catalogue.md`,
  `26-pattern-engine.md`, the Audit Log ref, and `01-data-model-*` for `ai_call_log`/`ai_feedback`.
- `docs/e2e-test-plan/` rows for the admin AI-calls view + any feedback UI.

## Decisions (confirmed)

1. ✅ **Phase 1 first** (logging + accurate cost) on its own, then context/learning.
2. ✅ **Add 👍/👎 feedback** on AI outputs (the learning signal) — Phase 3.
3. ✅ **30-day retention** for full prompt/result payloads (the cost row is kept longer).
4. ✅ **Re-derive scores** from real logged data after Phase 1.
5. ✅ **Stripe cost mirror** — nightly cron writes per-customer AI cost to Stripe Customer
   metadata (see "Stripe cost mirror" above).

**Table design (refinement):** extend the existing `ai_usage_log` rather than a separate table —
add accurate-cost columns (`cached_tokens`, `thoughts_tokens`, `duration_ms`, `status`, `error`)
+ observability columns (`context_block`, `prompt`, `raw_result jsonb`), all nullable. The AI
Usage panel keeps reading the numeric columns; the prune cron nulls the text columns after 30
days while keeping the cost row. One write per call.

## Phase 1 — build checklist (in progress)

- [x] Migration `20260812000000_ai_observability.sql`: extend `ai_usage_log` (cost-breakdown +
  observability columns) + admin read policy + `ai_feedback` table + indexes/grants. *(applied locally)*
- [x] Accurate cost + observability folded into `logAiUsage` (uses `estimateGeminiCostUsd`; accepts
  `contextBlock`/`prompt`/`rawResult`/`durationMs`/`status`/`error`, base64-stripped + truncated).
  Chose to extend the existing helper rather than a new `logAiCall` so all 27 callers get accurate
  cost with zero edits. Deno-tested (12 cases, 633/633 green).
- [x] Retired the crude flat per-token costing.
- [ ] Sweep the ~10 non-logging callers (companion-planting, pattern-evaluate, ailment/library seeders, plant-naming) to log.
- [ ] Thread context/prompt/raw into the top features first (agent-chat, plant-doctor, care-guides…).
- [ ] Admin "AI calls" view (filter + expand context→prompt→result).
- [ ] `sync-stripe-ai-cost` cron → Stripe Customer metadata.
- [ ] Prune cron (null text payloads > 30 days).
- [ ] Deno tests (cost math) + docs sync (`13-ai-gemini.md`, catalogue, data-model).
