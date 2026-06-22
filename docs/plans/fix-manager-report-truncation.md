# Fix — Head Gardener report (and insights summary) truncated / empty output

## Problem

On the live Head Gardener Overview the report shows only its fallback headline
("Here's where your garden stands.") with no greeting, sections or gaps. The AI
Insights summary also visibly cuts off mid-sentence.

## Root cause

Two compounding issues in the shared Gemini helper + my report function:

1. **`gemini.ts` reads only the first response part.** `callOnce` does
   `candidate?.content?.parts?.[0]?.text`. Gemini splits long output across
   **multiple `parts`**, so a large report JSON is captured only up to the first
   part → truncated string → `JSON.parse` throws in `garden-manager-report` →
   `parsed = {}` → fallback headline + empty sections. (`supabase/functions/_shared/gemini.ts:218`)
2. **Tight token caps + thinking.** The newer cascade models spend output budget on
   "thinking"; with `maxOutputTokens` at 256 (insights summary) / 1400 (report)
   there isn't enough left → truncation / MAX_TOKENS.
3. **Failed generations get cached.** `generateManagerReport` upserts the report
   even when the parse failed, so the bad fallback sticks until the hash changes.

## App-reference consulted

- `docs/app-reference/99-cross-cutting/13-ai-gemini.md` (cascade, JSON mode, token budget)
- `docs/app-reference/02-dashboard/16-head-gardener.md` (report flow)

## Fix

1. **`_shared/gemini.ts`** — join ALL text parts, not just `[0]`. Extract a pure
   helper `joinPartsText(parts)` and use it in `callOnce` (and the tool-calling
   reader if it has the same pattern). Behaviour unchanged for single-part responses;
   fixes multi-part truncation for every caller (including the insights summary).
2. **Tolerant parsing** — `garden-manager-report`, `synthesize-garden-brief` and
   `head-gardener-chat` use `extractJsonObject()` (`_shared/extractJson.ts`) instead
   of raw `JSON.parse` (handles fences / prose / minor malformation).
3. **Raise caps** — report `maxOutputTokens` 1400 → 4096; insights-feed summary
   256 → 1024. (Chat 1000 is fine.)
4. **Don't cache failures** — in `generateManagerReport`, if the parsed report has no
   greeting AND no sections AND no gaps, skip the `garden_manager_reports` upsert and
   return it un-persisted so the next open retries instead of serving a stuck shell.

## Tests

- New Deno test for `joinPartsText` (single part, multi-part join, missing/empty,
  non-string parts ignored) in `supabase/tests/`.
- Existing Deno/unit suites must stay green.

## Docs

- Note the multi-part read fix in `13-ai-gemini.md`.
- `TESTING.md` inventory + Deno count for the new test.

## Risk

`gemini.ts` is shared by every AI call. The change is additive (join vs index-0) and
strictly more correct, so existing single-part callers are unaffected. Token-cap
bumps only raise ceilings. After deploy, the user's currently-cached empty report
clears on the next refresh / input change (or immediately via the Overview refresh button).
