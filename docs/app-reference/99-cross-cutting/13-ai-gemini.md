# AI — Gemini Calls, Rate Limits, Caching

> All AI in Rhozly routes through Google Gemini via Supabase Edge Functions. The browser never calls Gemini directly — security + key isolation. Usage logged to `ai_calls` for the Audit Log + per-user quotas.

## Defence-in-depth: auth check before env-var validation

**Every Gemini-calling edge function MUST call `requireAuth(req, supabase)` before reading `GEMINI_API_KEY` or any other env-var that throws on `undefined`.** Prior to 22.0048, `plant-doctor` and `generate-guide` threw their env-var errors first, which on a misconfigured deploy either:

- Leaked the internal error message (`"GEMINI_API_KEY is not set."`) to anonymous callers (info-leak), OR
- Fell through to a generic 200 "fallback" response, bypassing the auth check entirely (auth bypass).

The order in every edge function that calls Gemini should now be:

```ts
const supabase = createClient(...);
const authResult = await requireAuth(req, supabase);
if (authResult instanceof Response) return authResult;
// ...only then read GEMINI_API_KEY / PERENUAL_API_KEY / etc.
```

Covered by `supabase/tests/edge_function_auth.test.ts` — every Gemini-calling function should have an EF-* row asserting that an unauthenticated request returns 401, even when the env vars are missing.

---

## Quick Summary

```
Browser ──► Edge Function ──► Gemini API
              │
              ├── _shared/gemini.ts (wrapper)
              ├── inserts ai_calls row (audit)
              └── returns response
```

Models used:
- **Gemini Vision** — image identification, diagnosis, area scan.
- **Gemini Text** — chat, blueprint generation, task suggestion, optimise.

### Garden context injection

Many text-generation surfaces consume `_shared/gardenContext.ts`'s `buildGardenContext()` to ground responses in the user's actual garden. The snapshot includes home + climate + areas + existing plants + preferences. As of the crop-rotation work, every outdoor area's snapshot also carries a **rotation block** (per-year family timeline + avoid + prefer family lists) computed by `_shared/rotationContext.ts`.

The prompt block format for an area now reads:

```
Existing areas (3):
  - South Bed (4×2m) — sun:full, medium:loam, pH:6.5
    Rotation history for "South Bed":
      - 2026: Solanaceae
      - 2025: Asteraceae
      - 2024: Solanaceae
      - AVOID this year: Solanaceae
      - PREFER this year: Brassicaceae, Fabaceae, Alliaceae
```

Surfaces that consume this block today: `generate-garden-overhaul` (via `buildGardenContext`) and `generate-swipe-plants` (direct injection). The Layer B fn `suggest-rotation-plants` consumes the rotation block via the per-area `fetchAreaRotationBlock()` helper.

### Cascade order (`_shared/gemini.ts` — `DEFAULT_MODELS`)

Cheapest → most capable. The cascade falls through on per-call failure (timeout, 429, 5xx). For Plant Library seed/verify the cost lift from a full fall-through is material — top rung is `$0.10 / $0.40` per million, bottom is `$1.50 / $9.00` — ~15× input cost.

1. `gemini-2.5-flash-lite`
2. `gemini-2.5-flash-lite-preview-09-2025`
3. `gemini-2.5-flash`
4. `gemini-3-flash-preview`
5. `gemini-3.1-flash-lite-preview`
6. `gemini-3.1-flash-lite`
7. `gemini-3.5-flash`

**Timeouts abort the losing request.** `callGeminiCascade` and `callGeminiWithTools` race each attempt against the per-call timeout via `raceWithTimeout`, which threads an `AbortController` into the underlying `fetch` and **aborts** the in-flight request when the timer wins. The old bare `Promise.race` left the timed-out request running to completion — the retry then started a SECOND live request and both billed tokens. (The Imagen helpers always did this correctly.)

### Reading the response — multi-part output

Gemini splits long output across multiple `content.parts` (more so on the thinking-capable gemini-3 rungs). `callOnce` therefore joins **every** text part via `joinPartsText(parts)` rather than reading `parts[0]` — reading only the first part silently truncated large JSON documents (e.g. the Head Gardener Estate Report), which then failed `JSON.parse`. The tool-calling reader already concatenates all text parts. Structured-output callers should parse with the tolerant `extractJsonObject()` (`_shared/extractJson.ts`) and set `maxOutputTokens` high enough to leave headroom for thinking (the report uses 4096; the insights summary 1024).

### Per-feature cascade override — `VISION_DIAGNOSIS_MODELS`

Vision-heavy plant-doctor actions opt out of the Flash-only default. `_shared/gemini.ts` exports a second cascade led by Pro models:

1. `gemini-2.5-pro`
2. `gemini-3.1-pro-preview`
3. `gemini-3-flash-preview` (Flash safety net)
4. `gemini-2.5-flash` (last resort)

Used by `identify_vision`, `diagnose`, `identify_pest`, `analyse_comprehensive`, and `identify_scene` in `plant-doctor/index.ts`. Trades ~20× cost per call for noticeably better visual reasoning. Other vision actions across the codebase can opt in by passing `models: VISION_DIAGNOSIS_MODELS` to `callGeminiCascade`.

### Per-tier chat cascade — `agent-chat/chatModels.ts`

The Garden AI chat picks its cascade by subscription tier (`modelsForTier`, split 2026-07-08 — the round-7 eval showed Pro-class models transform the chat, and the top model is now the Evergreen differentiator):

| Tier | Cascade |
|------|---------|
| Evergreen | `gemini-3.1-pro-preview` → `gemini-2.5-pro` → `gemini-3-flash-preview` → `gemini-2.5-flash` |
| Sage | `gemini-2.5-pro` → `gemini-3-flash-preview` → `gemini-2.5-flash` |
| Sprout / Botanist / unknown | `gemini-3-flash-preview` → `gemini-2.5-flash` → `gemini-2.5-flash-lite` |

`gemini-3.1-pro-preview` appears in **no other tier's cascade** — it is Evergreen-exclusive by product decision (docs/plans/evergreen-top-model-and-overdue-nudge.md). Flash rungs remain in the paid cascades as availability fallbacks.

**Object detection (`identify_scene` / Multi-ID).** Gemini returns native bounding boxes as `box_2d = [ymin, xmin, ymax, xmax]` normalised to **0–1000** (top-left origin). The `SCENE_MAP_SCHEMA` responseSchema requests one box + ranked candidate IDs per detected plant; the client maps `box_2d` → CSS percentages via `src/lib/sceneMap.ts` to overlay boxes on the rendered photo. Boxes are approximate — pair them with the confidence weighting rather than treating them as pixel-exact.

### Pricing (per 1M tokens, confirmed against https://ai.google.dev/gemini-api/docs/pricing)

| Model | Input | Cached input | Output |
|-------|-------|--------------|--------|
| gemini-2.5-flash-lite | $0.10 | $0.01 | $0.40 |
| gemini-2.5-flash-lite-preview-09-2025 | $0.10 | $0.01 | $0.40 |
| gemini-2.5-flash | $0.30 | $0.03 | $2.50 |
| gemini-3-flash-preview | $0.50 | $0.05 | $3.00 |
| gemini-3.1-flash-lite-preview | $0.25 | $0.025 | $1.50 |
| gemini-3.1-flash-lite | $0.25 | $0.025 | $1.50 |
| gemini-3.5-flash | $1.50 | $0.15 | $9.00 |
| gemini-2.5-pro | $1.25 | $0.125 | $10.00 |
| gemini-3.1-pro-preview | $2.00 | $0.20 | $12.00 |

Pro tier rates shown are for the ≤200k context window (larger window exists but plant-doctor never approaches it). Cache discount is consistently **10% of input** across the current Gemini range. Output rate also applies to "thinking" / reasoning tokens — they're not free.

The Plant Library admin page renders this same table at the bottom from `src/lib/geminiPricing.ts`. The Deno-side `supabase/functions/_shared/geminiCost.ts` is the billing-math authority — **keep both in sync** when Google publishes new rates.

### Imagen 4 — image generation

Used by the Planner Garden Overhaul feature (`generate-garden-overhaul`) to produce "after" concept images of redesigned gardens. Paid tier only.

| Model | Per image |
|-------|-----------|
| `imagen-4.0-fast-generate-001` | $0.02 |
| `imagen-4.0-generate-001` | $0.04 |
| `imagen-4.0-ultra-generate-001` | $0.06 |

Pricing mirrored in `supabase/functions/_shared/geminiCost.ts` (`IMAGEN_PRICING` + `estimateImagenCostUsd`) and `src/lib/geminiPricing.ts`. Each Imagen call logs to `ai_usage_log` with the new `image_count` + `image_cost_usd` columns so the Audit page surfaces per-image cost accurately. Call shape: POST to `/v1beta/models/{model}:predict` with `{ instances: [{prompt}], parameters: { sampleCount, aspectRatio } }`; response carries the base64 image bytes under `predictions[0].bytesBase64Encoded`. See `generateImagenImage` in `_shared/gemini.ts`.

**Batch API** is used by the Plant Library admin's "Batch seed" feature (see `submit-plant-library-batch` + `poll-plant-library-batches`). 50% off across all models, input AND output. Endpoint: `POST /v1beta/models/{model}:batchGenerateContent` for submission, `GET /v1beta/{batch_name}` for status/results. Inline format only (under 20MB request limit, 48h result retention). Helpers live in `_shared/gemini.ts`: `submitGeminiBatch`, `getGeminiBatchStatus`, `getGeminiBatchResults`, `cancelGeminiBatch`. The synchronous cascade still owns interactive / chunked seeding; batch is for one-shot bulk submission where 1-24h latency is fine.

---

## Role 1 — Technical Reference

### Edge functions that call Gemini

(see [Edge Functions Catalogue](./10-edge-functions-catalogue.md) for full list)

Highlights:
- `plant-doctor` (identify / diagnose / pest / **analyse_comprehensive** — combined Gemini call returning structured analysis + `suggested_tasks[]` for one-tap calendar commit / **lookup_frost_dates** — open to all tiers, caches into `home_climate` for 6 months / **plant_when_to_plant** — Sage+ per-plant guidance anchored to cached frost dates)
- `plant-doctor-ai` (chat — schema includes `text`, `suggested_plants`, `suggested_tasks`, `detected_preferences`, and `plan_suggestion?` for the proactive Planner CTA. Caller passes `priorPlanSuggested: boolean` to enforce the once-per-thread rule.)
- `generate-landscape-plan` (blueprint)
- `generate-task-from-photo`
- `scan-area`
- `optimise-area-ai`
- `area-sensor-analysis` (AI Area Coach — persona-aware JSON-mode call grounded in an area's soil-sensor readings + plants + automations; cached in `area_ai_insights`, reading-driven invalidation)
- `generate-guide`
- `search-plants-ai`
- `companion-planting`
- `visualiser-analyse`
- `seed-plant-library` / `submit-plant-library-batch` / `verify-plant-library` (admin-triggered + cron — see Plant Library AI contracts below)

### Plant Library AI contracts (seeder + verifier shape rules)

The Plant Library pipeline (`seed-plant-library` → `verify-plant-library`) has the strictest shape rules of any Gemini caller in the app because the output lands directly in `public.plant_library` rows, which then power filtered search and the public plant directory. Two contracts are enforced at multiple layers (prompt + response schema + server-side filter):

**Vocabulary for season fields.** `flowering_season` and `harvest_season` accept ONLY the four season words `{spring, summer, autumn, winter}`. The seeder prompt at `_shared/plantSeedPrompt.ts` enforces this in prose; the verifier prompt at `verify-plant-library/index.ts` enforces the same vocabulary when it produces `amended` updates (with an explicit "Wikipedia mentions months → map to seasons" example). The verifier's response schema enum-constrains both fields. As a final defence, `pickAllowedUpdates` in `verify-plant-library/helpers.ts` filters non-enum values out of the AI's output; if nothing remains, the field is dropped from the update rather than overwriting an existing season list with `[]`. `pruning_month` legitimately stores month names and is exempt from all of this.

**Non-shrinking multi-value arrays.** For `propagation`, `attracts`, `pest_susceptibility`, `sunlight`, and `soil`, the seeder produces multi-element lists from its broader knowledge of the plant; the verifier compares against Wikipedia + GBIF, which almost never enumerate every legitimate entry. A shorter source list is NOT evidence our seed data is wrong — Wikipedia mentioning bees does not prove butterflies don't visit. The verifier prompt explicitly says "Adding values is OK; removing values is not." `pickAllowedUpdates` rejects strict-subset amendments (incoming is a subset of existing with nothing added) and merges additive amendments rather than overwriting. Tested in `supabase/tests/verify-plant-library-amendments.test.ts`. The historical bug this contract closes: the verifier was stripping richer seed values down to whatever Wikipedia mentioned in passing.

If you add a new edge function that writes to `plant_library`, the same two contracts apply — copy the prompt rules and the helper.

### `_shared/gemini.ts` (typical)

```ts
async function callGemini({ model, prompt, image?, schema? }) {
  // standardised request with timeout + retry
  // logs to ai_calls
  // returns parsed response
}
```

### `ai_usage_log` table (the AI call ledger)

One row per Gemini/Imagen call, written by `_shared/aiUsage.ts` → `logAiUsage`:

```ts
{
  id, created_at, user_id, home_id, function_name, action, model,
  prompt_tokens, candidates_tokens, cached_tokens, thoughts_tokens, total_tokens,
  image_count, image_cost_usd, estimated_cost_usd,   // cost via estimateGeminiCostUsd (accurate)
  duration_ms, status, error,                         // status: ok | error | fallback
  context_block, prompt, raw_result,                  // observability — truncated, base64-stripped, nulled after 30d
}
```

- **Cost is accurate** — `logAiUsage` costs each call with `_shared/geminiCost.ts`
  (`estimateGeminiCostUsd`: per-model input/output/cache/thoughts rates + batch discount), NOT a flat
  per-token rate. Migration `20260813000000` backfilled historical rows.
- **Observability** — callers pass `contextBlock` / `prompt` / `rawResult` so a call can be reviewed.
- Surfaces: Account Tab's AI Usage Panel (per-home), the **`/admin/ai-calls`** admin viewer (all
  calls; expand context→prompt→result), and the **`sync-stripe-ai-cost`** daily cron which mirrors
  per-customer cost onto Stripe Customer metadata (`ai_cost_usd_30d/_total`, `ai_calls_30d`).
- A daily `prune-ai-usage-payloads` cron nulls the text payloads after 30 days (keeps the cost row).
- See [docs/plans/ai-audit-and-improvement.md](../../plans/ai-audit-and-improvement.md) for the wider plan.

### Two feedback tables — keep them distinct

There are **two** thumbs-up/down tables and they are NOT the same thing:

| Table | Component | Purpose | Surfaced in |
|-------|-----------|---------|-------------|
| `ai_feedback` | `src/components/ai/AiFeedback.tsx` | **AI learning signal** — rates a specific AI *output* (a generated answer / diagnosis) so the model/prompt can be tuned. | `/admin/ai-calls` viewer (joined alongside the `ai_usage_log` row) |
| `content_feedback` | `src/components/feedback/ContentFeedback.tsx` | **Content-quality signal** — rates a piece of *content* (a guide, a doc page, a help answer, a workflow). Not an AI call; no `ai_usage_log` link. | `/admin/content-feedback` viewer (admin-only, route gated by `is_admin`) |

`content_feedback` columns: `id, created_at, user_id, home_id, surface, target_kind, target_id, target_label, rating (±1), comment`. RLS: a user inserts / updates / reads their **own** rows; admins read all. A 👎 inserts the row immediately, then reveals an optional "what's wrong / inaccurate" box that patches the same row's `comment` — so the negative signal is never lost even if no comment is left. `surface` values in use: `rhozly-guide`, `grow-guide`, `app-help`, `documentation`, `onboarding-flow`. Wired into the guide reader, Grow Guide tab, Plant Guides tab, App Help, and the Help Center drawer. Migration `20260817000000_content_feedback.sql`. The `/admin/content-feedback` viewer (`src/components/admin/ContentFeedbackAdmin.tsx`) lists feedback newest-first with surface + 👍/👎 filters and is linked from the User Profile Dropdown's admin section.

### Quotas

Per-tier monthly token budgets enforced server-side. When exhausted, edge function returns a 429 with `code: "quota_exceeded"`.

### Caching strategy

- **Provider plant details** — cached in `plants` row (`data` jsonb) to avoid re-fetch.
- **AI care guides (Wave 2+ of AI Plant Overhaul)** — stored in `plants.care_guide_data` (jsonb) on the global AI catalogue row. Replaces the legacy 30-day TTL string-keyed cache. Reads hit the catalogue first (zero AI cost on cache hit); writes happen during `generate_care_guide`. Invalidation is **freshness-version-based**, not TTL: the `refresh-stale-ai-plants` cron (Wave 4) re-checks every 90 days; the `manual-refresh-ai-plant` edge fn re-checks on user request. `freshness_version` bumps when content changes; clients compare against `user_plant_ack.seen_freshness_version` to decide whether to show the "Updated" chip. See [AI Plant Catalogue](./33-ai-plant-catalogue.md) (planned, Wave 9) for the full lifecycle.
- **AI care guides (legacy / transitional)** — also still written to the string-keyed `getCached/setCached` for backward compatibility during the AI Plant Overhaul rollout. Removed once Wave 7 backfill completes.
- **Image search results** — cached briefly per query.
- **Pattern engine outputs** — `user_insights` row persists until dismissed.

### Rate limiting

Per-user soft caps (e.g. 60 calls/min) at the edge function level prevent runaway loops.

### Retries

Idempotent calls retry once on Gemini 5xx. Non-idempotent (image upload then analyse) skip retry to avoid double-billing.

### Structured output

Most calls use Gemini's JSON-mode with a schema (`responseMimeType: "application/json"`, `responseSchema`) for reliable parsing.

**Enum constraints** on array items are honoured strictly — Gemini will only return values from the allowed list or fail the response. Used to lock enumerated values for fields where Gemini otherwise free-styles:

- `CARE_GUIDE_SCHEMA.plantData.flowering_season` and `harvest_season`: enum `["Spring", "Summer", "Autumn", "Winter"]`. Without this constraint, Gemini was returning month names or comma-separated month strings.
- `CARE_GUIDE_SCHEMA.plantData.pruning_month`: enum `["Jan", "Feb", ..., "Dec"]`. Strict abbreviated month names; never full names or seasons.

Used by both `plant-doctor`'s `generate_care_guide` action and the standalone `manual-refresh-ai-plant` edge function. Hemisphere-tuning is applied by the prompt, not the schema (the enum is the same regardless of hemisphere — the choice of WHICH season/month maps to the user's hemisphere comes from the prompt instruction).

### Personalisation context

Edge functions can fetch `user_behaviour_summary` (refreshed weekly) to ground responses in the user's history without re-sending it every call.

---

## Role 2 — Expert Gardener's Guide

### Why all AI goes via edge functions

- Keeps the Gemini API key off the browser.
- Logs every call for cost + audit.
- Enforces tier gating + quotas server-side (can't be bypassed by the client).

### Implications

- AI features feel slightly slower than direct calls (one extra hop) — trade-off for safety.
- Audit Log shows where every AI dollar went.
- If you ever see a "quota exceeded" error, the Account Tab's AI Usage panel tells you what month-to-date you've spent.

---

## Related reference files

- [Edge Functions Catalogue](./10-edge-functions-catalogue.md)
- [Audit Log](../07-management/08-audit-log.md)
- [Tier Gating](./17-tier-gating.md)
- [Account Tab](../06-account/01-account-tab.md) — AI Usage Panel

## Code references for ongoing maintenance

- `supabase/functions/_shared/gemini.ts`
- `supabase/migrations/*_ai_calls.sql`
- Tier limits typically in `_shared/quotas.ts` or env vars
