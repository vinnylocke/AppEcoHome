# Garden Overhaul

> Photo-grounded AI redesign of an existing garden. Sage+ admin uploads a photo of their current garden + describes likes/dislikes/wants, and Gemini Vision + Imagen 4 produce a redesign blueprint + 3 "after" concept images. Result lands as a `plans` row (kind='overhaul') that flows through Plan Staging like any other plan.

**Trigger:** "Overhaul" button on Planner Dashboard (next to "New Plan").
**Route:** Inline modal — no dedicated URL.
**Source files:**
- `src/components/planner/OverhaulPlanForm.tsx` — the input modal
- `src/components/planner/OverhaulResultView.tsx` — before/after + blueprint + feedback
- `src/components/PlannerDashboard.tsx` — Overhaul button + plan-card click routing
- `src/services/gardenOverhaulService.ts` — service helpers
- `supabase/functions/generate-garden-overhaul/index.ts` — edge fn
- `supabase/functions/_shared/gardenContext.ts` — context snapshot builder
- `supabase/migrations/20260625000000_planner_garden_overhaul.sql` — schema + storage buckets

---

## Quick Summary

Single-step modal: photo capture/upload + 3 free-text fields (likes / dislikes / wants) + aesthetic selector + image-quality toggle. Submit kicks off an edge fn that runs in `EdgeRuntime.waitUntil`:

1. **Vision + blueprint pass** — one Gemini call (Pro vision cascade) analyses the photo, drafts the redesign blueprint, and generates 3 distinct image prompts (modern / cottage / wildlife / etc).
2. **Imagen 4 image generation** — 3 parallel calls to `imagen-4.0-fast-generate-001` ($0.02 each) produce the "after" concept images.
3. **Persistence** — inserts `plans` row, `plan_overhaul_inputs` (with full context snapshot), `plan_overhaul_concepts` rows, logs each AI/Imagen call to `ai_usage_log`.

Result view polls every 4s until concepts appear (~30-60s total). User picks one concept (radio behaviour, server-side), can leave thumbs/text feedback, and the plan flows through Plan Staging.

---

## Role 1 — Technical Reference

### Tier gating

**Sage+ only.** Frontend renders a locked placeholder for Sprout/Botanist. Backend double-checks via `guardAiByHome` AND an explicit `subscription_tier ∈ {sage, evergreen}` check. Configurable rate limit via `system_rate_limit_overrides` (defaults: `sage: 3/hr, evergreen: 8/hr`).

### Schema

| Table | Purpose |
|-------|---------|
| `plans` (existing, + `kind` column) | `kind='overhaul'` distinguishes from `'designed'` |
| `plan_overhaul_inputs` | Original photo URL + likes/dislikes/wants + `context_used jsonb` snapshot |
| `plan_overhaul_concepts` | N generated images with per-image cost + `selected_by_user` flag |
| `plan_overhaul_feedback` | Thumbs + free-text (one row per user per plan) |
| `ai_usage_log` (extended) | `image_count` + `image_cost_usd` columns for Imagen calls |
| `system_rate_limit_overrides` | Admin-tunable per-(function, tier) rate limits |

### Storage

- `garden-overhaul-photos` (private bucket) — original user uploads. Signed URL good for 7d so the result view can show the "before" image.
- `garden-overhaul-concepts` (public bucket) — AI-generated "after" images. Public is fine; they're generative output, not PII.

### Edge fn flow (`generate-garden-overhaul`)

```
POST { homeId, photoBase64, mimeType, likes, dislikes, wants, aesthetic?, imagenTier?, conceptCount? }
  → requireAuth() → guardAiByHome() → enforceRateLimit()
  → tier ∈ {sage, evergreen}
  → upload photo to garden-overhaul-photos
  → buildGardenContext() snapshot
  → INSERT plans row (kind='overhaul', name='Garden Overhaul (generating…)')
  → INSERT plan_overhaul_inputs row
  → return 202 { plan_id }
  → EdgeRuntime.waitUntil:
       → Gemini Vision (VISION_DIAGNOSIS_MODELS) — schema-constrained JSON return
       → UPDATE plans.ai_blueprint + name + description
       → Promise.all(generateImagenImage × conceptCount)
         → upload each to garden-overhaul-concepts
         → INSERT plan_overhaul_concepts rows
         → logAiUsage per Imagen call (image_count: 1, image_cost_usd: $0.02)
       → if all images failed → UPDATE plans.status = 'Failed'
```

### Garden context snapshot

`_shared/gardenContext.ts` pulls in parallel:
- Home (postcode, hemisphere, hardiness zone)
- `home_climate` (frost dates, avg temp, rainfall)
- Areas (sunlight, growing medium, pH, dimensions — up to 30)
- Active inventory plants (up to 50, grouped by area)
- `user_preferences.data` jsonb

Returns BOTH a rendered text block (for the prompt) AND a structured JSON snapshot (stored on `plan_overhaul_inputs.context_used` for auditability — answers "what did the AI know?" when a user complains).

### Cost per overhaul

- Vision + blueprint: ~$0.04-$0.06 (Pro cascade, image input + ~6k output tokens)
- 3 × Imagen 4 Fast: $0.06 (or $0.12 on Standard tier)
- **Total: ~$0.10-$0.18 per overhaul**

All logged individually to `ai_usage_log` so the Audit page sums them accurately.

### Rate limit

```
TIER_LIMITS["generate-garden-overhaul"] = { sprout: 0, botanist: 0, sage: 3, evergreen: 8 }
```

Overridable per-(function, tier) via `system_rate_limit_overrides` table — admin can raise/lower without redeploying.

### Feedback

Thumbs + free-text via `plan_overhaul_feedback`. Upserts on `(user_id, plan_id)` so re-rating replaces. Mirrors `optimiser_proposal_feedback` shape.

---

## Role 2 — Expert Gardener's Guide

### Why open this view

You've got a garden you're not in love with — patchy lawn, awkward layout, no colour in summer, dreary in winter. You want a vision for what it could look like instead, with a concrete plant list + tasks instead of a Pinterest board. The Overhaul tool takes a photo of your current garden, reads it like a designer would, and gives you 3 different "after" concepts plus the redesign you can actually act on.

### Every flow on this view

1. **Click "Overhaul"** on Planner Dashboard (next to "New Plan"). Tier-gated to Sage+ — Sprout/Botanist see a locked placeholder.
2. **Add a photo** (camera or library). Best results: stand back, capture the whole space in good daylight.
3. **Describe** what you like, dislike, and want. Be specific — "more colour in July, fewer slug-prone plants" beats "make it nicer". The AI uses these verbatim.
4. **Pick aesthetic** if you have a preference. "Open to suggestions" is fine.
5. **Pick quality**: Fast ($0.02/image, ~10s each) for quick concepts, Standard ($0.04/image) for higher fidelity.
6. **Generate** → modal closes, result view opens. Blueprint lands in ~5-10s, concept images in another 20-40s.
7. **Pick** a concept you like. It gets marked on the plan; you can change later.
8. **Leave feedback** so we know what works. Helps tune the prompt over time.

### Information on display

Result view shows:
- **Before / After grid** — your photo on the left, 3 AI concepts on the right.
- **Redesign blueprint** — project title + summary + difficulty/maintenance/timeline chips, full plant list with roles, recurring maintenance schedule, prep steps.
- **"Context fed to AI"** (collapsible) — exactly what data Rhozly sent to the AI about your garden (home, climate, areas, plants, preferences). Useful when a suggestion feels off — you can check whether the AI knew about your clay soil.

### Common pitfalls

- **Blurry / dark photos** lead to weaker analysis. Take in daylight, frame the whole space.
- **Vague descriptions** lead to generic suggestions. Tell it what you actually want.
- **Concept images are illustrative** — they're 1024px AI generations, not photo-real renders of your garden. They show the AESTHETIC, not the literal final layout.

---

## Related reference files

- [Planner Dashboard](./01-planner-dashboard.md)
- [New Plan Form](./04-new-plan-form.md)
- [Plan Staging](./02-plan-staging.md)
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md)
- [Tier Gating](../99-cross-cutting/17-tier-gating.md)
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md)
- [Audit Log](../07-management/08-audit-log.md)

## Code references for ongoing maintenance

- `src/components/PlannerDashboard.tsx` — Overhaul button + tier check + plan-card click routing
- `src/components/planner/OverhaulPlanForm.tsx` — input modal
- `src/components/planner/OverhaulResultView.tsx` — result view (before/after, blueprint, feedback)
- `src/services/gardenOverhaulService.ts` — service helpers
- `src/lib/geminiPricing.ts` — `IMAGEN_PRICING` mirror for client-side cost estimates
- `src/components/AuditPage.tsx` — image_count + image_cost_usd column rendering
- `supabase/functions/generate-garden-overhaul/index.ts` — edge fn
- `supabase/functions/_shared/gardenContext.ts` — context snapshot builder
- `supabase/functions/_shared/gemini.ts` — `generateImagenImage` helper + `VISION_DIAGNOSIS_MODELS`
- `supabase/functions/_shared/geminiCost.ts` — `IMAGEN_PRICING` + `estimateImagenCostUsd`
- `supabase/functions/_shared/aiUsage.ts` — extended `logAiUsage` accepts image counts
- `supabase/functions/_shared/rateLimit.ts` — `system_rate_limit_overrides` lookup
- `supabase/migrations/20260625000000_planner_garden_overhaul.sql` — schema + buckets
- `supabase/config.toml` — `[functions.generate-garden-overhaul]` registration
