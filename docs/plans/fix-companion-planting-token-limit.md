# Fix — Companion Planting tab always fails ("failed to get companion data")

## Symptom
On production, the Companions tab fails everywhere it appears (Library plant preview, The Shed plant edit, and the new Add-to-Shed detail modal): it shows "failed to get companion data" with a Retry button that never succeeds.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/13-ai-gemini.md` — the Gemini cascade + thinking-token behaviour
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — `companion-planting`

## Root cause
`supabase/functions/companion-planting/index.ts` calls `callGeminiCascade(...)` with **`maxOutputTokens: 1500`** and a `responseSchema`, while the prompt asks for **5–10 beneficial + 3–6 harmful + 3–6 neutral** plants, each with `name`, `scientificName` and a 1–2 sentence `reason` — easily 1,000–1,500+ tokens of JSON on its own.

The default model cascade (`gemini-2.5-flash` / `gemini-3.x` previews) are **thinking models**: their reasoning ("thoughts") tokens count against `maxOutputTokens`. With only 1,500 total, thinking consumes the budget and the JSON response comes back truncated (or with no content part). `generateAiCompanions` then `JSON.parse(text)` throws.

A JSON-parse/truncation failure is **not** in the cascade's "retryable" set (only 503/429/Timeout retry), so the cascade falls straight through all 7 models — each hits the same wall — and the function returns a 500. Hence: fails on every plant, every retry. Every comparable structured-output function in the codebase uses 4096–8192 output tokens; `companion-planting`'s 1500 is the outlier.

## Fix
Raise `maxOutputTokens` in `companion-planting/index.ts` from `1500` → **`8192`** (matching `add-plant-to-library`). That leaves ample room for thinking tokens **and** the full companions JSON, so the response is complete and parses.

Single-line change:
```ts
{ temperature: 0.3, maxOutputTokens: 8192, responseSchema: COMPANION_SCHEMA },
```

## Why not change the shared cascade
The cascade is shared by many functions that already work, so the bug is local to `companion-planting`'s budget, not `callGeminiCascade`. (A separate, optional hardening — guarding `data.candidates[0].content.parts[0]` in `callOnce` and surfacing `finishReason` — would make *any* future truncation fail with a clearer message; out of scope for this fix to avoid touching shared code that every AI function depends on.)

## Tests
No unit test — it's a Gemini config value (not pure logic). Verified by deploying and opening the Companions tab on a plant.

## Docs to update
- `10-edge-functions-catalogue.md` — note companion-planting's output budget if it lists per-fn token caps (light touch).

## Risks
- Minimal. Higher token ceiling only raises the cap; typical companion output is well under it, so cost impact is negligible (a few hundred extra output tokens at most when thinking runs long).

## Deploy
Edge-function change → needs a deploy (`supabase functions deploy` runs inside `npm run deploy`). Bundle with the "See full care" feature already staged.
