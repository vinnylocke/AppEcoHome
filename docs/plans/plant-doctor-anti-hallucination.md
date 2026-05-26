# Plan — Plant Doctor: stop hallucinated diagnoses

User reported a diagnose call returning "black spots" and "aphids" that weren't in the photo. The `diagnose` and `identify_pest` actions speculate when the species + environment could plausibly support a diagnosis.

## App-reference consulted

- [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md)
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md)

## Fixes (all four)

### 1. Two-stage reasoning prompt

Force the model to ENUMERATE visible features first, THEN diagnose only conditions whose required evidence is in that list. New prompt structure:

> STEP 1: List every literally-visible symptom in the photo (spots, holes, discoloration patterns, insects, webbing, frass, wilting, etc). If you can't see anything wrong, say so explicitly.
>
> STEP 2: ONLY diagnose conditions whose REQUIRED visible symptoms appear in your Step 1 list. Do NOT diagnose based on species susceptibility or environmental context alone — those refine probability, they don't create evidence.

### 2. Explicit anti-hallucination clause

Lift the wording already used in `analyse_comprehensive`:

> DO NOT invent diseases / pests based on plant species or environment alone. The photo must show the evidence. Returning an empty array + 'Healthy' severity is the correct answer when nothing is visibly wrong.

### 3. Server-side confidence floor

After Gemini returns, drop diseases / pests with `confidence < 50` before responding. Keeps the UI clean of low-confidence guesses without changing the schema.

```ts
if (Array.isArray(parsed.possible_diseases)) {
  parsed.possible_diseases = parsed.possible_diseases.filter(
    (d: { confidence?: number }) => (d.confidence ?? 0) >= 50,
  );
}
```

### 4. Lower temperature

Currently `callGeminiCascade` defaults to 0.7. Pass `temperature: 0.2` for both actions — diagnose / pest want consistent + conservative, not creative.

## Files

| File | Change |
|------|--------|
| `supabase/functions/plant-doctor/index.ts` | `diagnose` + `identify_pest` actions: rewrite prompts (two-stage + anti-hallucination), add confidence filter, set temperature: 0.2 |

## App-reference updates

- `05-tools/02-plant-doctor.md` — note the two-stage / confidence-floor behaviour in Role 1's prompt section.

## Risks

- Confidence threshold of 50 might be too aggressive on edge cases — a real but subtle disease could land at 45%. Mitigation: tune the threshold after a few real diagnoses; this is a static constant, easy to adjust.
- Two-stage prompt adds some output tokens (the "STEP 1 visible features" list). Marginal cost increase. Worth it for accuracy.

## Sequencing

1. Edit prompts + add filter + lower temp.
2. Typecheck Deno.
3. Deploy `--bump 1`.
