# Plan — Companion tab: fix Venus Flytrap retry loop + surface real errors

## Context

Reported by Vinny: searching for "Venus Flytrap", opening the **Companion** tab → endless **Retry** button. The user wants (a) the underlying failure fixed, (b) the actual reason shown when it fails, (c) a clear "no companions" message when the plant genuinely has none.

## App-reference consulted

- [docs/app-reference/08-modals-and-overlays/11-companion-plants-tab.md](docs/app-reference/08-modals-and-overlays/11-companion-plants-tab.md) — Companion tab contract (Verdantly free path + AI path + cache).
- [docs/app-reference/99-cross-cutting/13-ai-gemini.md](docs/app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini cascade conventions.

## Root cause

1. **[supabase/functions/_shared/gemini.ts:211](supabase/functions/_shared/gemini.ts#L211)** dereferences `data.candidates[0].content.parts[0].text` blind. Carnivorous / niche plants like Venus Flytrap regularly cause Gemini to return zero candidates (safety block) or a candidate with empty `parts` (MAX_TOKENS hit during thinking). That throws a cryptic `TypeError: Cannot read properties of undefined…` instead of a meaningful "Gemini returned no content (finishReason: …)".
2. **[supabase/functions/companion-planting/index.ts:138](supabase/functions/companion-planting/index.ts#L138)** hard-requires *5–10 beneficial / 3–6 harmful / 3–6 neutral*. Venus Flytrap (or any carnivorous bog plant) has effectively zero traditional companions; the model burns its thinking budget trying to invent some, then returns no usable text.
3. **[src/components/CompanionPlantsTab.tsx:242](src/components/CompanionPlantsTab.tsx#L242)** captures only the `"fetch_failed"` enum — the actual error string from the edge function is discarded. The Retry UI gives the user no reason and no escape hatch.

## Approach

### A. Edge: make Gemini's failure mode visible (1 file, ~10 lines)

[supabase/functions/_shared/gemini.ts:209-211](supabase/functions/_shared/gemini.ts#L209-L211) — defensively read the candidate text. If absent, throw a clear, attributable error:

```ts
const data = await res.json();
const candidate = data.candidates?.[0];
const text = candidate?.content?.parts?.[0]?.text;
if (typeof text !== "string") {
  const finishReason = candidate?.finishReason ?? "UNKNOWN";
  const blockReason = data.promptFeedback?.blockReason;
  throw new Error(
    `Gemini ${model} returned no usable text (finishReason: ${finishReason}${blockReason ? `, blockReason: ${blockReason}` : ""}).`,
  );
}
return { text, usage: { ... } };
```

This stops the silent `TypeError`, attributes the model + reason, and the cascade can fall through to the next model in `DEFAULT_MODELS`. Applied to the non-tool path used by `callGeminiCascade` (the companion-planting code path).

### B. Edge: soften the companion prompt + protect the JSON parse (1 file, ~15 lines)

[supabase/functions/companion-planting/index.ts:125-138](supabase/functions/companion-planting/index.ts#L125-L138):

- Soften minimums: "Include **up to** 10 beneficial / 6 harmful / 6 neutral plants."
- Add: *"If the plant has no commonly known companions (e.g. a carnivorous bog plant, a houseplant grown indoors only, an aquatic plant), return empty arrays — do not invent companions."*

[supabase/functions/companion-planting/index.ts:155](supabase/functions/companion-planting/index.ts#L155) — guard the parse:

```ts
let parsed: CompanionPlantsResult;
try {
  parsed = JSON.parse(text) as CompanionPlantsResult;
} catch (err) {
  log(FN, "ai_parse_failed", { plant_name: plantName, snippet: text.slice(0, 200) });
  throw new Error(`AI returned invalid JSON for "${plantName}".`);
}
```

The combined effect: Venus Flytrap now returns `{beneficial:[], harmful:[], neutral:[]}` cleanly, the cache write skips empty (so the call retries next time — same as today), and the **existing empty-state** on [src/components/CompanionPlantsTab.tsx:521-527](src/components/CompanionPlantsTab.tsx#L521-L527) shows *"No companion data found for this plant"*.

### C. Client: surface the error reason + sharpen the empty state copy (1 file, ~20 lines)

[src/components/CompanionPlantsTab.tsx](src/components/CompanionPlantsTab.tsx):

1. Add `errorMessage: string | null` state alongside the existing enum.
2. Capture `firstErr.message` / `retryErr.message` into it when setting `fetch_failed`.
3. Render the message inside the Retry block when present:

```tsx
{error === "fetch_failed" && (
  <>
    <p className="text-xs font-bold text-rhozly-on-surface/50">Could not load companion data.</p>
    {errorMessage && (
      <p
        data-testid="companion-error-detail"
        className="text-[11px] text-rhozly-on-surface/40 leading-snug max-w-xs"
      >
        {errorMessage}
      </p>
    )}
    <button …>Retry</button>
  </>
)}
```

4. Empty state copy update — current line *"No companion data found for this plant."* is correct but a bit terse for unusual plants. Expand to: *"No common companion plants are recorded for this one — that's normal for unusual plants like carnivorous, aquatic, or strictly-indoor species."* with the existing Sprout icon.

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/_shared/gemini.ts` | Defensive candidate read + finishReason in thrown error |
| `supabase/functions/companion-planting/index.ts` | Softer prompt, allow empty arrays explicitly, guard JSON.parse |
| `src/components/CompanionPlantsTab.tsx` | Surface error message; sharpen empty-state copy |
| `docs/app-reference/08-modals-and-overlays/11-companion-plants-tab.md` | Error-state + empty-state contract update |

## Tests

- No existing E2E/unit spec covers the companion tab error/empty states. Manual verification:
  - Venus Flytrap → opens to the empty-state ("No common companion plants…").
  - Force a Gemini failure (invalid API key) → Retry block shows the error message text below the existing copy.
- `tests/unit/lib/companionCache.test.ts` doesn't exist; the cache change is opaque and not worth a fresh test.

## Risks

- The defensive text-read in `gemini.ts` is shared by every cascade caller. The new throw path is semantically equivalent to the old TypeError (still throws), just with a better message — no caller's catch behaviour changes.
- Softening the prompt may slightly reduce companion counts for borderline plants. Acceptable — empty arrays are honest.

## Release notes

Single `--bump 1` — bundle as "Fixed".
