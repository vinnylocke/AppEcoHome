# Plan — Always show Rhozly AI suggestions alongside Pl@ntNet, even when Pl@ntNet is confident

## Context

User: "for the plant identifier even if plant net is sure can we also show ai results"

Today the `identify_vision` action in [`plant-doctor/index.ts`](../../supabase/functions/plant-doctor/index.ts) routes by Pl@ntNet's top match score:

| Score | Route | Gemini called? |
|-------|-------|----------------|
| ≥ 0.4 | `plantnet` (trust) | **No** — synthesises possible_names from Pl@ntNet alone |
| 0.15–0.4 | `cross_check` | Yes — runs both, surfaces disagreement |
| < 0.15 / null | `ai_fallback` | Yes — Gemini only |

The trust path was a latency + cost optimisation. The user prefers to see AI suggestions too, even when Pl@ntNet is confident, so they can compare and notice when an LLM picks up details Pl@ntNet missed (or vice versa).

## App-reference files consulted

- [`docs/app-reference/05-tools/02-plant-doctor.md`](../app-reference/05-tools/02-plant-doctor.md) — identify flow, response shape, tier-gating (action requires AI)
- [`docs/app-reference/99-cross-cutting/25-plant-providers.md`](../app-reference/99-cross-cutting/25-plant-providers.md) — Pl@ntNet integration, trust thresholds
- [`docs/app-reference/99-cross-cutting/13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini cost / cascade context

## Approach

### Edge function — `plant-doctor/index.ts`

1. **Remove the trust-path early return** (current lines 1167-1197) so every `identify_vision` request runs the Gemini call too.
2. **Parallelise Pl@ntNet + Gemini** so we don't pay for serial latency. Pl@ntNet is fast and the Gemini call dominates anyway, but `await Promise.all([pn, gemini])` keeps the total at `max(pn, gemini)` instead of `pn + gemini`.
3. **Preserve the primary `possible_names` semantics**:
   - When `routing.source === "plantnet"` (trust path) → `possible_names` = Pl@ntNet's top 3 (current synthesised shape), so Pl@ntNet tiles remain the visual lead.
   - When `cross_check` / `ai_fallback` → `possible_names` = Gemini's top 3 (current behaviour).
4. **Add `ai_alternatives`** to every response. Array of `{ name, scientific_name, confidence }` populated from Gemini's top 3 candidates. On the trust path this is the new "also from Rhozly AI" tile group. On the other paths it's a duplicate of `possible_names` — the UI will skip rendering it there to avoid double tiles.
5. **Keep `identification_source`** as today so the UI can still distinguish trust vs cross-check vs ai_fallback.

### UI — `PlantDoctor.tsx`

After the existing `possible_names` tile group (around line 1454):

- Render an `aiAlternatives` group ONLY when `identification_source === "plantnet"` AND `ai_alternatives.length > 0`. Skip on the other paths since `possible_names` already carries Gemini's data.
- Section header: small label "Also from Rhozly AI" with the standard AI-badge styling.
- Tiles reuse the existing `bg-white` + AI badge styling already coded for the AI path (the bigger conditional at line 1445).
- Tap behavior is identical to existing tiles — sets `selectedPlantName` + `selectedPlantScientific`.

### Schema + types

- Add `ai_alternatives?: Array<{ name: string; scientific_name?: string; confidence?: number }>` to the `IdentifyVisionResult` interface in the client + the response payload type-hint in the function.
- Existing clients that ignore the field continue to work — purely additive.

## Files modified

| File | Change |
|------|--------|
| [`supabase/functions/plant-doctor/index.ts`](../../supabase/functions/plant-doctor/index.ts) | Drop trust-path early return; parallelise Pl@ntNet + Gemini; always emit `ai_alternatives` |
| [`src/components/PlantDoctor.tsx`](../../src/components/PlantDoctor.tsx) | New AI-alternatives tile group rendered after the main `possible_names` group when source = "plantnet" |
| [`docs/app-reference/05-tools/02-plant-doctor.md`](../app-reference/05-tools/02-plant-doctor.md) | Update identify_vision response shape + routing table to note Gemini now runs on every call |
| [`docs/app-reference/99-cross-cutting/25-plant-providers.md`](../app-reference/99-cross-cutting/25-plant-providers.md) | Trust path no longer skips Gemini — note the change |

## Tests

- **Deno**: add a case to whichever `plant-doctor` test covers identify_vision routing — assert that when Pl@ntNet scores ≥ 0.4, the response still includes `ai_alternatives` populated by the Gemini mock. (If the existing test file uses real Gemini, mock it; otherwise add a guard.)
- **Vitest**: not strictly needed — PlantDoctor is exercised via the e2e suite. A unit test on the new tile-group conditional would be nice if there's a colocated test, otherwise skip.
- **Playwright (docs only)**: update the identify_vision row in `docs/e2e-test-plan.md` to mention AI alternatives are now visible on the trust path.

## Deploy

- One function deploy: `plant-doctor`.
- One Vercel deploy for the frontend.
- Minor bump → 21.0010.

## Risks

- **Cost**: every identify_vision now does a Gemini call (Pro cascade). Per-call cost goes from "~free + Pl@ntNet" → "cents + Pl@ntNet". On a typical user identifying a few plants a week this is small; on a power user it's still meaningful. Acceptable per user intent.
- **Latency**: parallelisation keeps total close to Gemini-only latency (~3-5s). Slightly slower than today's trust path which was ~1s Pl@ntNet only. Worth it for the richer answer.
- **Tier-gating already enforced**: identify_vision is AI-gated upstream (line 644 `skipAiGate` whitelist excludes it), so non-AI users can't hit this code path anyway. No tier regression possible.
- **No DB / cron / schema migration.** Purely additive response field + UI render.
