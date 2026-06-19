# AI Area Coach — per-plant analysis, compatibility verdict + reliable range back-fill

**Feedback:** *"On the dashboard I open the AI Area Coach and it regenerates, but the soil moisture/EC/temp min & max in the `plants` and `plant_library` tables still aren't populated — isn't that where it gets the info? It should look at all plants in the area, compare each plant's values against the sensor/area readings, give per-plant analysis in the same format, and also tell me if the plants' requirements vary too much to grow together — or if it's only a moisture difference, that they may need more plant-focused/zoned watering."*

## Two problems

### (a) The catalogue soil ranges never populate

The block that back-fills `plants.soil_*` and `plant_library.soil_*` ([area-sensor-analysis/index.ts:160-258](../../supabase/functions/area-sensor-analysis/index.ts#L160-L258)) runs **only after** the cache gate at [index.ts:118](../../supabase/functions/area-sensor-analysis/index.ts#L118). On the dashboard the panel auto-opens with `force=false` ([AreaAiAnalysisPanel.tsx:54](../../src/components/area/AreaAiAnalysisPanel.tsx#L54)), and `shouldRegenerate` returns false whenever there's no sensor reading newer than the cached insight. So it repaints the cache and **never resolves or persists ranges** — what looks like "it regenerates" is a cache repaint.

Even when it *does* regenerate, the back-fill is throttled:
- `MISSING_CAP = 3` Gemini generations per run.
- The "missing" filter requires **all three** of moisture/EC/temp ranges to be null ([index.ts:198-201](../../supabase/functions/area-sensor-analysis/index.ts#L198-L201)) — a plant with moisture but null EC/temp is never topped up.
- Only `inventory_items` with a non-null `plant_id` reach the catalogue at all.

### (b) No per-plant analysis or compatibility verdict

The current schema returns exactly three area-level metrics with one *combined* ideal range ([areaAnalysisPrompt.ts:90-136](../../supabase/functions/_shared/areaAnalysisPrompt.ts#L90-L136)). There's no per-plant breakdown, no "these plants want very different things" verdict, and no moisture-only "water separately" note.

## App-reference consulted

- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `area_ai_insights` cache contract, `based_on_reading_at` staleness rule.
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `area-sensor-analysis` entry.
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — cascade usage, rate-limit + usage logging.
- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — `plants` catalogue, `soil_*` columns, shared-catalogue semantics.
- [03-garden-hub/04-area-details.md](../app-reference/03-garden-hub/04-area-details.md) + [03-garden-hub/03-location-manager.md](../app-reference/03-garden-hub/03-location-manager.md) — the two surfaces that mount `AreaAiAnalysisPanel`.
- Prior plans: [ai-area-analysis.md](./ai-area-analysis.md), [dashboard-area-coach.md](./dashboard-area-coach.md).

---

## Part A — Make range back-fill reliable (decoupled from the cache gate)

The expensive thing is Gemini; the cheap thing is the library lookup + the `plants`/`plant_library` `UPDATE`s. Split them:

1. **Always run the cheap path**, even when serving cache: resolve each area plant's ranges from `plants` + `plant_library` (existing `mergeCareRanges`) and persist any column the catalogue is missing but the library supplies. This heals the common case ("library has the data, columns were just never written") on the very first view, with **zero Gemini spend**.
2. **Keep Gemini generation gated + bounded**, but fix its gaps:
   - Trigger generation when **any** of the three ranges is null (not only when all three are), since the generator returns the full set.
   - Lift the per-run cap modestly (e.g. `MISSING_CAP` 3 → 5) and let successive views drain the rest; keep it bounded for cost. Only run generation on the regenerate path (so cache-serves stay free).
3. **`plant_id IS NULL` plants** (manual instances not linked to the catalogue) can't be written to `plants` — note this in the insight's confidence line rather than silently dropping them.

This means: first dashboard open heals library-covered plants immediately; AI-only gaps fill over a few views.

## Part B — Per-plant analysis + compatibility verdict

### Schema ([_shared/areaAnalysisPrompt.ts](../../supabase/functions/_shared/areaAnalysisPrompt.ts) `AREA_ANALYSIS_SCHEMA`)

Add two fields alongside the existing `metrics`:

```jsonc
"plant_analysis": {            // one entry per plant in the area
  type: "array",
  items: { properties: {
    name: string,
    moisture_fit: "good"|"low"|"high"|"unknown",
    temp_fit:     "good"|"low"|"high"|"unknown",
    ec_fit:       "good"|"low"|"high"|"unknown",
    notes: string               // how THIS plant sits vs the current readings
  }, required: ["name","notes"] }
},
"compatibility": {
  type: "object",
  properties: {
    verdict: "well_matched"|"minor_variance"|"poorly_matched",
    moisture_only: boolean,     // true ⇒ the only big divergence is moisture
    note: string                // e.g. "Lavender wants it far drier than the ferns —
                                //  consider zoned/plant-focused watering"
  },
  required: ["verdict","note"]
}
```

`metrics` (area-level) stays — it's the at-a-glance summary; `plant_analysis` is the per-plant detail the user asked for.

### Prompt ([buildAreaAnalysisPrompt](../../supabase/functions/_shared/areaAnalysisPrompt.ts#L174))

Extend the task section so the model must:
- Produce **one `plant_analysis` entry per plant**, comparing that plant's stored `[ideal: …]` ranges (authoritative) against the current/averaged sensor readings, in the same status/notes shape as the metrics.
- Fill `compatibility`: if the plants' ranges diverge widely (esp. across moisture/EC/temp) say they may not suit growing **together**; if the only large divergence is **moisture**, set `moisture_only=true` and recommend zoned / plant-focused watering rather than splitting them up.

Keep the existing persona branching + "stored ranges are authoritative" instruction. The per-sensor + averaged readings are already in the prompt context.

### Types + UI

- [src/services/areaSensorsService.ts](../../src/services/areaSensorsService.ts) — extend `AreaInsight` with `plant_analysis?` + `compatibility?`.
- [src/components/area/AreaAiAnalysisPanel.tsx](../../src/components/area/AreaAiAnalysisPanel.tsx) — render a **Per-plant** section (a card/row per plant with three small fit pills + notes) and a **Compatibility** callout (colour-keyed to verdict; surfaces the moisture-only "water separately" advice). `data-testid`s: `area-ai-plant-{name}`, `area-ai-compatibility`. Tolerate older cached insights that lack the new fields (optional chaining + conditional render).

## Files changing

| File | Change |
|------|--------|
| [supabase/functions/area-sensor-analysis/index.ts](../../supabase/functions/area-sensor-analysis/index.ts) | Always run cheap library resolve + persist; fix per-metric missing filter; raise/loop Gemini cap; pass plants for per-plant prompt. |
| [supabase/functions/_shared/areaAnalysisPrompt.ts](../../supabase/functions/_shared/areaAnalysisPrompt.ts) | Schema + prompt + `AreaInsight` type + parse for `plant_analysis` + `compatibility`. |
| [src/services/areaSensorsService.ts](../../src/services/areaSensorsService.ts) | Extend `AreaInsight` type. |
| [src/components/area/AreaAiAnalysisPanel.tsx](../../src/components/area/AreaAiAnalysisPanel.tsx) | Per-plant + compatibility rendering. |

## Tests

- **Deno** ([supabase/tests/](../../supabase/tests/)) — extend the area-analysis prompt tests: schema includes `plant_analysis` + `compatibility`; prompt names each plant; `parseAreaInsight` tolerates presence/absence of the new fields. Add a unit for the per-metric "missing" filter logic if extracted into a pure helper.
- **Playwright** — panel renders per-plant cards + a compatibility callout when present; still renders cleanly for a legacy insight without them.

## App-reference to update

- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `area-sensor-analysis` now back-fills on view + emits per-plant/compatibility.
- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `area_ai_insights.insight` shape gains the two fields.
- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — note the Coach self-heals `soil_*` ranges on view.
- [03-garden-hub/04-area-details.md](../app-reference/03-garden-hub/04-area-details.md) + [03-garden-hub/03-location-manager.md](../app-reference/03-garden-hub/03-location-manager.md) — document the AI Area Coach panel + new sections (currently under-documented).

## Risks / edge cases

- **Cost.** Always running the *cheap* persist is fine; Gemini stays gated to the regenerate path + bounded cap, so cache-serves remain free.
- **Token budget.** `plant_analysis` grows the response with plant count; `maxOutputTokens` is 2048 — may need a modest bump for big areas, or cap the per-plant list to the N most relevant.
- **Legacy cached insights.** UI + parse must not assume the new fields exist.
- **`plant_id IS NULL`.** Surface in the confidence note; can't persist to the shared catalogue.
