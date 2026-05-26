# Plan — Planner: Garden Overhaul (photo → AI redesign + concept images)

## Goal

A new entry on the Planner Dashboard alongside "New Plan": admin uploads a photo of their current garden, describes likes/dislikes/wants in free text, and the AI returns:

1. A structured **redesign blueprint** (plant list, maintenance schedule, project overview) — same shape as the existing `generate-landscape-plan` output so it slots into Plan Staging unchanged.
2. **Multiple AI-generated "after" concept images** (3-4, different aesthetics) via Imagen 4 — user picks the one they like best.
3. **Captured context** — home/area/climate/existing-plants/preferences fed into the prompt so suggestions are personalised.
4. **Feedback capture** (thumbs / free-text) on the result.
5. Result lands as a `plans` row marked `kind='overhaul'`.

## App-reference consulted

- [04-planner/01-planner-dashboard.md](../app-reference/04-planner/01-planner-dashboard.md)
- [04-planner/04-new-plan-form.md](../app-reference/04-planner/04-new-plan-form.md)
- [04-planner/02-plan-staging.md](../app-reference/04-planner/02-plan-staging.md)
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md)
- [99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md)
- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md)
- [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md) — for Vision input flow

## Image generation — Imagen 4 confirmed pricing

Per https://ai.google.dev/gemini-api/docs/pricing (paid tier, no free option):

| Model | Per image | Use |
|-------|-----------|-----|
| `imagen-4.0-fast-generate-001` | $0.02 | Default for concept images |
| `imagen-4.0-generate-001` | $0.04 | "Higher quality" toggle |
| `imagen-4.0-ultra-generate-001` | $0.06 | (Skip in v1) |

**Default plan:** 3 concept images at Fast tier = **$0.06 per overhaul** for image generation alone, plus ~$0.05 for the Gemini Vision + text blueprint call. Total ~$0.11 per overhaul.

## Phase 1 — Schema

### `plans` table — add `kind` column

```sql
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'designed'
    CHECK (kind IN ('designed', 'overhaul'));
```

`'designed'` = existing `generate-landscape-plan` flow (3-step form, no photo input).
`'overhaul'` = new flow (photo-grounded redesign).

### `plan_overhaul_inputs` — stores the user's input + the original photo URL

```sql
CREATE TABLE public.plan_overhaul_inputs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL UNIQUE REFERENCES plans(id) ON DELETE CASCADE,
  original_photo_url text NOT NULL,
  likes           text,
  dislikes        text,
  wants           text,
  aesthetic       text,
  context_used    jsonb NOT NULL DEFAULT '{}'::jsonb, -- snapshot of what we fed AI
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

Storing `context_used` (snapshot of home/area/climate/prefs) makes the result reproducible + debuggable — if a user reports "this didn't account for my clay soil", we can see exactly what the AI knew.

### `plan_overhaul_concepts` — generated concept images

```sql
CREATE TABLE public.plan_overhaul_concepts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  image_url         text NOT NULL,                    -- in garden-overhaul-concepts bucket
  prompt            text NOT NULL,
  aesthetic         text NOT NULL,                    -- "modern" / "cottage" / "productive" / etc.
  imagen_model      text NOT NULL,                    -- "imagen-4.0-fast-generate-001"
  cost_usd          numeric(8,5) NOT NULL,            -- per-image cost from the price table
  selected_by_user  boolean NOT NULL DEFAULT false,   -- the one the user picked
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

User clicks a concept → row's `selected_by_user` flips to true (uniqueness enforced at app level — UI radio behaviour).

### `plan_overhaul_feedback` — thumbs + free-text feedback

Mirrors `optimiser_proposal_feedback`:

```sql
CREATE TABLE public.plan_overhaul_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating      text NOT NULL CHECK (rating IN ('positive', 'negative')),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_id)
);
```

### `ai_calls` — extend for image generation tracking

Existing table tracks Gemini text/vision calls. Add columns for image-gen tracking so the audit screen can show accurate per-image cost:

```sql
ALTER TABLE public.ai_calls
  ADD COLUMN IF NOT EXISTS image_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_cost_usd numeric(8,5) NOT NULL DEFAULT 0;
```

Image generation calls log a row with `image_count > 0` and `image_cost_usd > 0`, `model = imagen-4.0-fast-generate-001` (or whichever), and zero text-token fields.

### `system_rate_limit_overrides` — admin-controllable rate limits

Currently `enforceRateLimit` has per-user overrides via `user_rate_limit_overrides`. For system-wide configurable limits (admin sets default for everyone), add:

```sql
CREATE TABLE IF NOT EXISTS public.system_rate_limit_overrides (
  function_name text NOT NULL,
  tier          text NOT NULL CHECK (tier IN ('sprout','botanist','sage','evergreen')),
  max_per_hour  integer NOT NULL CHECK (max_per_hour >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id),
  PRIMARY KEY (function_name, tier)
);
```

`resolveMax` in `_shared/rateLimit.ts` checks this table BEFORE falling back to the hardcoded `TIER_LIMITS`. Admin can tune per-feature limits without redeploying.

### Storage bucket

New private bucket `garden-overhaul-photos` for user uploads + `garden-overhaul-concepts` (public) for generated images. Public is fine — they're AI generations, not user PII.

## Phase 2 — Tier gating

Sage+ only (`sage` and `evergreen`). Aligns with `generate-landscape-plan` gating + the $0.11/call cost.

- Frontend: tier check in the new button (locked placeholder for Sprout/Botanist with upgrade CTA).
- Backend: `guardAiByHome` in the edge function before Gemini calls.
- Rate limit added to `TIER_LIMITS`: `"generate-garden-overhaul": { sprout: 0, botanist: 0, sage: 3, evergreen: 8 }` — generous because $0.11 × 8/hour = $0.88/user/hour worst case.

## Phase 3 — Context injection

Before the Gemini call, gather:

- **Home**: postcode → climate / hardiness zone / hemisphere (from `home_climate` if cached, else lookup)
- **Areas**: dimensions, sunlight class, soil pH, growing medium of the user's existing areas
- **Existing plants**: top-N from inventory_items so AI suggests complements not replacements
- **Garden preferences**: from `user_preferences` (wildlife focus, edible focus, etc.)
- **Hemisphere + current month**: for season-appropriate suggestions

Pack into a `<garden_context>` block in the prompt. Same pattern as `_shared/visionEnvContext.ts` already uses for Plant Doctor.

## Phase 4 — Edge function `generate-garden-overhaul`

### Input

```ts
POST {
  homeId: string,
  photoBase64: string,
  mimeType: string,
  likes: string,
  dislikes: string,
  wants: string,
  aesthetic?: "Natural" | "Modern" | "Cottage" | "Productive" | "Wildlife",
  imagenTier?: "fast" | "standard",  // default: "fast"
  conceptCount?: number,             // default: 3, max: 4
}
```

### Flow

1. **Auth + tier guard** (`guardAiByHome` for Sage+).
2. **Rate limit** (`enforceRateLimit` — table-configurable per-tier).
3. **Context gather** (Phase 3 block).
4. **Vision + blueprint call** (one Gemini call via VISION_DIAGNOSIS_MODELS):
   - Input: the photo + the prompt (garden_context + likes/dislikes/wants + aesthetic)
   - Output (structured JSON):
     ```ts
     {
       photo_analysis: { current_conditions, plants_visible, layout_notes, problems_to_address },
       blueprint: { /* same shape as generate-landscape-plan */ },
       concept_prompts: [{ aesthetic, prompt }, ...]  // 3-4 distinct image prompts
     }
     ```
5. **Parallel Imagen calls** for each `concept_prompts[i].prompt`. Each call:
   - POST to `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:generateImages`
   - Upload result to `garden-overhaul-concepts` bucket
   - Log row in `ai_calls` with `image_count=1, image_cost_usd=0.02, model=imagen-4.0-fast-generate-001`
6. **Insert** the `plans` row (kind='overhaul'), `plan_overhaul_inputs` row, `plan_overhaul_concepts` rows.
7. **Return** the plan_id + concept image URLs + the blueprint.

If any image fails, the others still land — partial success is fine.

## Phase 5 — UI

### Planner Dashboard

New button next to "New Plan" — **"Overhaul existing garden"** with a camera icon. Sage+ only; Sprout/Botanist see a small "upgrade" badge.

### New modal — `OverhaulPlanForm`

Single-step (photo + text fields):

```
┌────────────────────────────────────────────┐
│ Overhaul existing garden                   │
├────────────────────────────────────────────┤
│ [📷 Take Photo] [📁 Choose from Library]   │
│ (photo preview)                            │
├────────────────────────────────────────────┤
│ What do you LIKE about your garden?        │
│ [____________________________________]     │
│                                            │
│ What do you DISLIKE?                       │
│ [____________________________________]     │
│                                            │
│ What do you WANT to add/change?            │
│ [____________________________________]     │
├────────────────────────────────────────────┤
│ Aesthetic: [Natural ▼]                     │
│ Generate quality: [● Fast (3× $0.02)       │
│                    ○ Standard (3× $0.04)]  │
├────────────────────────────────────────────┤
│ Estimated cost: $0.06 + $0.05 = ~$0.11     │
│                                            │
│   [Cancel]   [✨ Generate overhaul]        │
└────────────────────────────────────────────┘
```

While generating: progress indicator with stages ("Analysing photo… Designing layout… Generating concepts 1/3 / 2/3 / 3/3…"). Edge function returns 202 immediately + background work via EdgeRuntime.waitUntil; client polls the plan row until concepts populate (3-5 min).

### Result screen — `OverhaulResultView`

- **Before / After grid**: original photo on the left, 3-4 concept images on the right. Click to enlarge.
- Each concept: aesthetic label + radio button to pick "This is the one I want".
- Below: the blueprint (project overview, plant list, maintenance schedule) — reuses existing Plan Staging components.
- **Feedback row**: 👍 / 👎 + optional comment field. POSTs to `plan_overhaul_feedback`.
- "Promote to active plan" button — same as existing Plan Staging.

## Phase 6 — Audit screen updates

`src/components/AuditPage.tsx` already lists `ai_calls` rows. Updates:

- Show `image_count` column (currently hidden — only token columns).
- Show `image_cost_usd` summed into the cost column.
- Add a filter chip "Image generation" → filters to rows where `image_count > 0`.
- Total cost calculation includes `image_cost_usd`.

## Files

### Backend
| File | Change |
|------|--------|
| `supabase/migrations/20260625XXXXXX_planner_garden_overhaul.sql` | All new tables + plans.kind column + ai_calls extensions + system_rate_limit_overrides + storage buckets |
| `supabase/functions/_shared/gemini.ts` | New `generateImagenImage()` helper for Imagen 4 calls |
| `supabase/functions/_shared/geminiCost.ts` | Add Imagen 4 pricing entries (Fast / Standard / Ultra) |
| `supabase/functions/_shared/rateLimit.ts` | Check `system_rate_limit_overrides` table before tier defaults |
| `supabase/functions/_shared/aiGuard.ts` | (no change — existing `guardAiByHome` works) |
| `supabase/functions/_shared/gardenContext.ts` (new) | Pulls home/area/plant/prefs context for prompt injection — reusable elsewhere |
| `supabase/functions/_shared/aiUsage.ts` (or wherever logAiUsage lives) | Extend `logAiUsage` to accept `imageCount` + `imageCostUsd` |
| `supabase/functions/generate-garden-overhaul/index.ts` (new) | The main edge function |

### Frontend
| File | Change |
|------|--------|
| `src/lib/geminiPricing.ts` | Mirror Imagen 4 rates |
| `src/services/plannerService.ts` (or new `overhaulService.ts`) | New helper `generateGardenOverhaul`, `submitOverhaulFeedback` |
| `src/components/planner/OverhaulPlanForm.tsx` (new) | The input modal |
| `src/components/planner/OverhaulResultView.tsx` (new) | Before/after + concepts + blueprint |
| `src/components/PlannerDashboard.tsx` | New "Overhaul existing garden" button |
| `src/components/AuditPage.tsx` | Image count + cost columns + filter chip |

## App-reference updates

- `04-planner/01-planner-dashboard.md` — new button entry
- `04-planner/04-new-plan-form.md` — note the alternative overhaul flow
- New: `04-planner/09-garden-overhaul.md` — full new surface doc (use template)
- `99-cross-cutting/10-edge-functions-catalogue.md` — `generate-garden-overhaul` entry
- `99-cross-cutting/13-ai-gemini.md` — Imagen 4 model row in pricing table, note image-gen pattern
- `99-cross-cutting/17-tier-gating.md` — gated to Sage+
- `99-cross-cutting/00-INDEX.md` — add the new ref doc

## Sequencing

Suggested order (each step independently shippable; whole feature lands when step 6 deploys):

1. **Migration** (schema + storage buckets).
2. **Imagen helper + cost integration** (`_shared/gemini.ts`, `_shared/geminiCost.ts`, audit screen showing image rows).
3. **Garden context builder** (`_shared/gardenContext.ts`).
4. **Edge function** `generate-garden-overhaul`.
5. **UI: form + result view + Planner Dashboard button**.
6. **Feedback capture + admin tunable rate limits**.
7. **App-reference docs**.

## Risks / things to watch

- **Imagen latency** — typically 5-15s per image, 3 in parallel = ~15s end-to-end. Plus Vision call ~5-10s. Total: ~25s of work. Use `EdgeRuntime.waitUntil` + return 202 immediately + client polls. Same pattern as batch submit.
- **Imagen content policy** — may refuse to generate certain things (e.g. very specific real-world locations). Edge fn catches refusal + records partial result.
- **Photo storage growth** — original photos take ~500KB-2MB each. Long-term we may need a retention policy (90-day delete after promotion to plan).
- **Cost surprises** — admin can hit "Generate" 8 times/hour at Sage tier = $0.88/hour worst case. Rate limit + the up-front cost estimate in the form mitigate.
- **Feedback table partial-use** — only captures aggregate up/down; doesn't tell us WHICH concept the user disliked. Acceptable for v1; could extend with `concept_id` later.
