# AI Area Analysis — sensor-aware area coaching

## Goal

Add a new **tier-gated AI tab** to the **Area Metrics modal** (LocationManager → location → area →
settings/edit icon, where `AreaSensorsPanel` already shows current + historical readings + averages).

On opening the tab, AI reads the area's **current + historical sensor readings**, the **plants growing
there** and their **care needs**, and the area's **automations**, then returns:

- Recommended target ranges for **soil moisture**, **EC**, and **soil temperature** (current vs ideal,
  with a good / low / high status per metric).
- A plain explanation of **what each metric means and how it relates to the plants** in the area.
- An **automation check** — if automations exist, whether they're set up sensibly; if not, **suggested
  automations** to add.
- **Persona-adapted** voice (rookie vs expert — see below).

The result is **cached and only regenerated when newer data arrives** (a sensor reading or manual entry
newer than the cached insight), with a per-user **rate limit** so it can't be spammed.

## Naming (user asked for suggestions)

The tab/feature needs a name. Options (recommend **"AI Area Coach"**):

| Name | Feel |
|------|------|
| **AI Area Coach** ⭐ | Warm, action-oriented, fits the rookie/expert persona angle |
| Soil & Sensor Insights | Descriptive, neutral |
| AI Agronomist | Authoritative/expert-leaning |
| Area Health Check (AI) | Diagnostic framing |
| AI Analysis (the user's working name) | Plain |

**Decisions (confirmed with user):** name = **"AI Area Coach"**; **auto-run on open** (cache-aware — shows
the cached insight instantly and only calls AI when readings are newer/absent); **full scope** for v1 —
moisture + EC + soil temp target ranges/meaning **plus** the automation check + suggestions.

## App-reference consulted

- [03-garden-hub/03-location-manager.md](../app-reference/03-garden-hub/03-location-manager.md) — the
  Area Metrics modal surface.
- [07-management/07-integrations-readings.md](../app-reference/07-management/07-integrations-readings.md),
  [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md)
  — readings + automations data.
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md),
  [10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md),
  [14-caching.md](../app-reference/99-cross-cutting/14-caching.md),
  [17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md),
  [09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md).

## Existing pieces reused

- **`optimise-area-ai`** edge fn — the template for gathering an area's plants/blueprints/ailments/
  weather context + calling Gemini for structured JSON. The new fn mirrors its shape.
- **Gemini + usage + cache + rate-limit helpers:** `_shared/gemini.ts` (`callGeminiCascade`, `toMessages`),
  `_shared/aiUsage.ts` (`logAiUsage`), `_shared/aiCache.ts`, `_shared/rateLimit.ts` (`enforceRateLimit`).
- **`areaSensorsService.ts`** — `fetchAreaSensors` / `fetchAreaSensorHistory` / `computeAreaMetricSummary`
  (the same data the panel already shows; reused on the client; the fn re-derives server-side).
- **Persona:** `user_profiles.persona: "new" | "experienced"` (the rookie / expert gardeners).
- **AI gate:** `profile.ai_enabled` (threaded as `aiEnabled`, exactly like AreaDetails / HomeDashboard).

## Design

### 1. Area Metrics modal → tabs (`LocationManager.tsx`)

Wrap the modal body in a small tab strip:
- **Readings** — the existing `AreaSensorsPanel` + the growing-medium / pH / light settings (current content).
- **{AI Area Coach}** — new `AreaAiAnalysisPanel`. Tier-gated: non-AI tiers see a compact upgrade prompt
  (no AI call). Thread `aiEnabled` (= `profile.ai_enabled`) into `LocationManager` from `App.tsx` (it
  isn't passed today).

### 2. `AreaAiAnalysisPanel.tsx` (new)

- On first open: `GET` the cached insight + the area's latest-reading timestamp. If a cached insight
  exists and is **current** (based on the latest reading) → render it with "Last analysed … · based on
  readings up to …". If **stale** or **absent** → call the edge fn to generate (auto once on open),
  surfacing rate-limit / no-sensor / no-plant states cleanly.
- A manual **"Re-analyse"** button (disabled while current; rate-limited).
- Renders the structured insight (below). `data-testid="area-ai-analysis-panel"`.

### 3. Edge fn `area-sensor-analysis` (new)

Mirrors `optimise-area-ai` (auth → membership → **AI-tier check** → gather → cache check → Gemini → persist).

- **Gather:** area + location + home (climate/zone/lat-lng/hemisphere); linked soil sensors + **current
  readings** + **historical aggregates** (`device_readings` for the area's devices); `inventory_items`
  in the area + plant names/species + any stored care-guide text; the area's **automations**
  (`automation_sensors` on those sensors + `automation_actions`); growing medium / pH from `areas`.
- **Latest-reading timestamp** = `max(recorded_at)` across the area's sensors' `device_readings`
  (covers both live + **manual** readings, since both land there).
- **Cache + invalidation:** new table **`area_ai_insights`** (one row per area). If
  `based_on_reading_at >= latestReadingAt` and not `force` → return cached (no Gemini call). Else
  regenerate.
- **Rate limit:** `enforceRateLimit` caps regenerations per user/day even when data is new (cost guard).
- **Gemini:** `callGeminiCascade` with a **persona-aware structured-JSON** prompt (builder in a pure,
  testable `_shared/areaAnalysisPrompt.ts`). Output schema: per-metric `{ current, ideal_min, ideal_max,
  status: good|low|high, meaning, why_for_these_plants }` for moisture / EC / temp; `automation_review`
  (existing OK? issues) or `automation_suggestions[]`; a short headline + persona-tuned summary.
- **Persist** to `area_ai_insights` (`insight` jsonb, `based_on_reading_at`, `generated_at`, `model`,
  `persona`). `logAiUsage(...)`.

### 4. Personas — rookie vs expert (extra features I'd add)

The prompt branches on `profile.persona`:
- **Rookie (`new`):** plain-language meaning for every metric, a one-line **"What to do right now"**, a
  mini-glossary, gentle (non-alarming) warnings, simpler whole-number targets.
- **Expert (`experienced`):** terse + technical (VWC %, µS/cm, agronomic ranges + tolerances), **EC
  drift / salinity-trend** notes from history, temperature/moisture interplay, **exact automation
  threshold values** to set, and **sensor-drift / anomaly flags**.
- **Both:** clear current-vs-ideal status per metric + a confidence line ("based on N readings over X
  days"). When no `persona` is set, default to a balanced middle voice.

### 5. Migration — `area_ai_insights`

```sql
CREATE TABLE public.area_ai_insights (
  area_id uuid PRIMARY KEY REFERENCES areas(id) ON DELETE CASCADE,
  home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  insight jsonb NOT NULL,
  based_on_reading_at timestamptz,        -- latest device_reading the insight reflects
  persona text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.area_ai_insights ENABLE ROW LEVEL SECURITY;
-- home-scoped RLS (member of home_id) + Data-API grants per CLAUDE.md.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.area_ai_insights TO authenticated;
```

## Files

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_area_ai_insights.sql` (new) | table + RLS + grants |
| `supabase/functions/area-sensor-analysis/index.ts` (new) | dispatcher: gather + cache + Gemini + persist |
| `supabase/functions/_shared/areaAnalysisPrompt.ts` (new) | pure persona-aware prompt builder + JSON-shape parser |
| `src/components/area/AreaAiAnalysisPanel.tsx` (new) | the tab UI |
| `src/services/areaSensorsService.ts` | add `fetchAreaInsight()` / `generateAreaInsight()` + latest-reading helper |
| `src/components/LocationManager.tsx` | tabbed Area Metrics modal + AI panel + `aiEnabled` |
| `src/App.tsx` | pass `aiEnabled={profile.ai_enabled}` to LocationManager (/management route) |

## Tests (mandatory)

- **Deno** `areaAnalysisPrompt.test.ts` — prompt builder includes sensor metrics/plants/automations;
  persona branch (rookie verbose vs expert terse); JSON-shape parser tolerant-parses + rejects garbage.
- **Deno** — staleness/cache decision helper (pure: `shouldRegenerate(cachedAt, latestReadingAt, force)`).
- **Vitest** — `AreaAiAnalysisPanel` staleness/label logic (extract a pure helper) + tier-gate render.
- **e2e/test-plan** + TESTING counts updated.

## Tier / cost / safety

- Gated by `profile.ai_enabled`; non-AI tiers never trigger a call (upgrade prompt only).
- Cache means **no Gemini call unless new readings**; `enforceRateLimit` caps regenerations regardless.
- `logAiUsage` records spend (model + tokens) like every other AI fn.

## Out of scope (follow-ups)

- Surfacing the same insight on the standalone Area page (`AreaDetails`) / dashboard.
- Push notification when a new analysis flags a problem.
- One-tap "apply suggested automation" from the suggestions (deep-link to the automations builder for now).
