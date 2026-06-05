# Pl@ntNet

> The trusted-botanical-DB identifier we run **before Gemini** for plant ID. Pl@ntNet is trained on millions of curated species photos and beats general vision LLMs on species accuracy — but it does identification *only*, so Gemini still owns care guides, health, pruning, disease, pest and the suggested-task synthesis. This file documents the contract, the routing decisions, and the operational notes.

**Docs:** [my.plantnet.org/doc/api](https://my.plantnet.org/doc/api)
**Helper module:** [`supabase/functions/_shared/plantnet.ts`](../../../supabase/functions/_shared/plantnet.ts)
**Tests:** [`supabase/tests/plantnet.test.ts`](../../../supabase/tests/plantnet.test.ts)

---

## Role 1 — Technical Reference

### When we call Pl@ntNet

| Plant Doctor action | Pl@ntNet behaviour |
|---------------------|--------------------|
| `identify_vision` | Pl@ntNet is the primary; Gemini runs only on cross-check or fallback. |
| `analyse_comprehensive` | Pl@ntNet is the ID step. Gemini always runs for the rest. Skipped when `targetPlant` was supplied (we already know the species). |
| `diagnose`, `identify_pest`, `identify_scene` | Not called. No Pl@ntNet equivalent for diagnosis / pest / multi-plant detection. |

### Request shape

- `POST https://my-api.plantnet.org/v2/identify/all?api-key={KEY}&lang=en`
- `multipart/form-data`:
  - 1–5 `images` parts (the same base64 the user uploaded, decoded to Blobs).
  - Matching number of `organs` parts: `auto` / `leaf` / `flower` / `fruit` / `bark`. Defaults to `auto`. User can per-photo tag via the multi-photo strip.

### Response (relevant fields)

```jsonc
{
  "bestMatch": { /* shape as below */ },
  "results": [
    {
      "score": 0.86,                          // 0–1 confidence
      "species": {
        "scientificNameWithoutAuthor": "Rosa rugosa",
        "scientificName": "Rosa rugosa Thunb.",
        "commonNames": ["Rugosa Rose", "Beach Rose"],
        "genus":  { "scientificNameWithoutAuthor": "Rosa" },
        "family": { "scientificNameWithoutAuthor": "Rosaceae" }
      },
      "gbif": { "id": "8358085" }
    }
    // up to 5 ranked desc
  ],
  "remainingIdentificationRequests": 487
}
```

`identifyWithPlantNet` flattens this into `PlantNetResult` (`bestMatch`, `topMatches[]`, `remainingRequests`, `query`).

### Routing decision

Implemented in `decideRouting(bestMatch)`. Thresholds are exported as `TRUST_THRESHOLD` (0.4) and `CROSS_CHECK_FLOOR` (0.15).

| Best-match score | `identification_source` | `crossCheck` | Behaviour |
|------------------|-------------------------|---------------|-----------|
| `null` or `< 0.15` | `ai_fallback` | false | Gemini does the ID exactly as before. |
| `0.15` – `0.4` | placeholder, resolved post-Gemini | **true** | Gemini ID runs too. Final source = `plantnet+ai_confirmed` if names agree, `plantnet_vs_ai_disagreement` otherwise. |
| `≥ 0.4` | `plantnet` | false | Trust Pl@ntNet for the lead `possible_names`. **Wave 21.0010 update:** for `identify_vision` we now run Gemini in parallel anyway and surface its top 3 candidates under `ai_alternatives` — the UI renders these as an "Also from Rhozly AI" tile group below the Pl@ntNet tiles. Total latency stays at `max(pn, gemini)` because the two calls run via `Promise.all`. For `analyse_comprehensive` we still feed Gemini the confirmed name and let it focus on the non-ID sections. |

Disagreement detection uses `speciesNamesAgree(a, b)` — case-insensitive genus+species comparison (ignores authorship suffix). Returns `false` on empty strings.

### Error handling

`identifyWithPlantNet` throws a typed `PlantNetError` so the edge function can branch:

| `reason.kind` | Trigger | Edge-fn behaviour |
|---------------|---------|-------------------|
| `no_key` | `PLANTNET_API_KEY` not set in Supabase secrets | Silent AI fallback. Surfaced as warn-level log so we can spot prod-config drift. |
| `auth` | 401 / 403 from upstream | Silent AI fallback. Warn log. |
| `quota_exhausted` | 429 from upstream | Silent AI fallback. Warn log. |
| `not_a_plant` | 404 from upstream (rejected as non-plant) | Treated as `bestMatch: null` → AI fallback. |
| `network` | fetch / 5xx | Silent AI fallback. Warn log. |
| `bad_response` | 200 with unparseable body | Silent AI fallback. Warn log. |

The principle: the user must always get *some* identification result. Pl@ntNet is an upgrade, not a single point of failure.

### Response stitching

Both `identify_vision` and `analyse_comprehensive` return the standard schema **plus a `plantnet` block**:

```ts
{
  ...existingFields,
  plantnet: {
    best_match: PlantNetMatch | null,
    top_matches: PlantNetMatch[],          // up to 5
    identification_source:
      | "plantnet"
      | "plantnet+ai_confirmed"
      | "plantnet_vs_ai_disagreement"
      | "ai_fallback",
    ai_suggested_name: string | null,      // populated on disagreement
    remaining_requests: number | null,
    error?: string,                        // present only when PlantNetError was caught
  } | null
}
```

`null` means Pl@ntNet wasn't queried (e.g. `analyse_comprehensive` called with a pre-supplied `targetPlant`).

### Persistence

`plant_doctor_sessions.plantnet_result` (added Wave 19, jsonb) captures the same block so the History view can render the provenance pill on previously-saved sessions. See [Data Model — Tasks](./04-data-model-tasks.md) for the session table; the column is owned by `plant_doctor_sessions`.

### Configuration

- Supabase secret: `PLANTNET_API_KEY`. Add via `supabase secrets set PLANTNET_API_KEY=…` or the Supabase dashboard.
- Pl@ntNet's pricing applies to the key holder. Free tier: 500/day; paid keys lift that. Quota is reflected in `remaining_requests`.
- Lang is fixed to `en` server-side. We could make this profile-driven later but the common names are also surfaced from our own catalogue + Verdantly for non-English UIs.

### Logging

- `_shared/plantnet.identify_request` — every call, with image count + organs.
- `_shared/plantnet.identify_success` — best score + species + remaining quota.
- `_shared/plantnet.no_matches` — Pl@ntNet returned but no usable match (used as a soft signal for the "unusual plant" empty state in the consumer).
- `plant-doctor.plantnet_error` (kind: `no_key | auth | quota_exhausted | not_a_plant | network | bad_response`) — fired by the edge function when it catches a `PlantNetError`.

---

## Role 2 — Expert Gardener's Guide

### Why does this matter to me?

You aim a camera at a plant. The app tells you what it is. Pl@ntNet is the boring-but-correct way that happens: a database of millions of botanical photos, ranked by experts. It knows the difference between *Rosa rugosa* and *Rosa canina*; it knows which leaves go with which fruit; it knows that the orange spotted thing on your hand is a moth, not a plant.

Behind the scenes, when you hit **Identify** or **Analyse**, Rhozly sends your photo(s) to Pl@ntNet *before* it reaches for Gemini. If Pl@ntNet is confident enough, we trust it — and Gemini either skips the ID step or uses Pl@ntNet's answer as the starting point for its care advice. If Pl@ntNet has a near-miss, both run and Rhozly shows you the difference. If Pl@ntNet rejected your photo or had no clue, Gemini does it all.

### What you'll see on screen

A small label on every Identify / Analyse result:

| Pill text | What it means |
|-----------|---------------|
| **Pl@ntNet · 87%** | Pl@ntNet was confident — that's the answer. |
| **Pl@ntNet + AI agreed** | Pl@ntNet's confidence was moderate, so we asked Gemini too. They concurred. |
| **Pl@ntNet (AI disagreed)** | They disagreed. A second line shows you both names — verify against the photo. |
| **AI only** | Pl@ntNet didn't have a usable answer (or wasn't available). The AI did the whole identification. |

Tap **Pl@ntNet candidates** below the pill to see the full ranked list with confidence percentages — handy when you want to consider the runner-up.

### How to get the best results out of Pl@ntNet

- **Add multiple photos** (up to 5). Different angles or organs of the same plant materially improve confidence.
- **Tag the organ** on each photo. Tap the `Auto` chip below a thumbnail to cycle to `Leaf` / `Flower` / `Fruit` / `Bark`. This tells Pl@ntNet what it's looking at.
- **Daylight, sharp, close.** Same advice as any AI vision: avoid backlight, motion blur, distant subjects.
- **Carnivorous / aquatic / ornamental hybrids** are Pl@ntNet's weak spots. If you're shooting one of those and Pl@ntNet rejects, the AI fallback usually still gets a sensible answer.

### What to do if something looks wrong

- **Pl@ntNet matched the wrong plant.** Open the candidates expander and pick a runner-up; the rest of the analyse panel still applies. If Pl@ntNet was confident *and* wrong consistently, send feedback so we can adjust thresholds.
- **AI disagreed banner is showing.** Both names + scores are surfaced; pick the one that matches the photo. The Disease / Pest / Tasks sections still apply regardless of which name you choose.
- **"AI only" pill — Pl@ntNet didn't run.** Either the API key is missing in this environment (admin issue) or Pl@ntNet rejected the photo as non-plant. Nothing to fix on the user side — the AI result is still good.

---

## Related reference files

- [Plant Lens (formerly Plant Doctor)](../05-tools/02-plant-doctor.md) — the consumer.
- [Plant Providers](./25-plant-providers.md) — Pl@ntNet joins Perenual + Verdantly as a third upstream.
- [AI — Gemini](./13-ai-gemini.md) — the other half of the identify pipeline.
- [Edge Functions Catalogue](./10-edge-functions-catalogue.md) — `plant-doctor` lists this under its ID actions.

## Code references for ongoing maintenance

- `supabase/functions/_shared/plantnet.ts` — helper, routing, errors.
- `supabase/functions/plant-doctor/index.ts` — `identify_vision` + `analyse_comprehensive` callers.
- `supabase/tests/plantnet.test.ts` — Deno tests for `decideRouting` / `speciesNamesAgree` / `resolveCrossCheck`.
- `src/services/plantDoctorService.ts` — `PlantNetIdentificationBlock` type that flows back to the client.
- `src/components/lens/AnalyseResultCard.tsx` — provenance pill + candidates expander.
- `src/components/PlantDoctor.tsx` — multi-photo strip + organ chips that feed Pl@ntNet.
