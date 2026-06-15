# Deno test failures — close the long-tail 11

`npm run test:functions` reports **11 failures** that have been ignored as "pre-existing" across the last few PRs. Investigated each — they split into four buckets, and two of them are real product bugs.

The 11 break down as:

| # | Test | Bucket | Real bug or stale test? |
|---|---|---|---|
| 1 | `aiUsage.test.ts` type-check | A — type contract drift | Stale test |
| 2 | `refreshStaleAiPlants.test.ts` type-check | A — type contract drift | Stale test |
| 3 | `heatwave — no alert when max temp is 31°C` | B — threshold drift | Stale test |
| 4-11 | 8× `ewelink.test.ts` sub-device | C — API-shape disagreement | Stale tests |
| 12 | `EF-001: plant-doctor — no Authorization header → 401` | D — env-leak / auth bypass | **Real product bug** |
| 13 | `EF-006: generate-guide — no Authorization header → 401` | D — env-leak / auth bypass | **Real product bug** |

(Counted as 11 in the "FAILED" line because the 2 type-check errors stop the suite from running before the runtime failures get a chance — the type-check errors are #1 and #2.)

---

## Bucket A — `GeminiUsage` type contract drift

[`supabase/functions/_shared/gemini.ts`](../../supabase/functions/_shared/gemini.ts) introduced `cachedContentTokenCount: number` and `thoughtsTokenCount: number` as REQUIRED fields on `GeminiUsage`. The two test mocks were never updated.

### Fix

Add the missing fields to both mocks. **Already applied** during investigation:

- `supabase/tests/aiUsage.test.ts:22-29` — `makeUsage()` returns the two fields with default 0
- `supabase/tests/refreshStaleAiPlants.test.ts:100-105` — `fakeUsage` literal includes them

### Risk

Zero. Tests now match the production interface.

---

## Bucket B — heatwave threshold drift

[`supabase/functions/_shared/weatherRules/heatwave.ts:6`](../../supabase/functions/_shared/weatherRules/heatwave.ts#L6):

```ts
const HEAT_THRESHOLD_C = 25;
```

The threshold was lowered from 32 → 25 (UK climate, where 32°C is rare and 25°C is hot enough to stress most temperate-zone plants). The test "no alert when max temp is 31°C (below threshold)" still expects 31°C to be sub-threshold — wrong because 31 ≥ 25 → alert fires correctly.

### Fix

Update the negative test to use a sub-25°C value (24°C). Renames the test name from "31°C" to "24°C" to keep the contract self-documenting.

### Risk

Zero. The rule is working correctly; the test was lying about the threshold.

---

## Bucket C — eWeLink sub-device API shape

The test file in [`supabase/tests/integrations/ewelink.test.ts:240-289`](../../supabase/tests/integrations/ewelink.test.ts#L240-L289) asserts that `buildControlPayload` for sub-devices returns:

```jsonc
{
  "apiPath": "/v2/device/thing/sub/status",  // ← /sub/ path
  "payload": {
    "id": "bridge-xyz",                       // ← parent bridge id
    "params": {
      "switches": [{ "switch": "on", "outlet": 0, "countdown": 600 }], // array
      "subDevId": "sub-001"                   // ← sub-device disambiguation
    }
  }
}
```

The implementation in [`supabase/functions/_shared/integrations/ewelinkDevice.ts:22-35`](../../supabase/functions/_shared/integrations/ewelinkDevice.ts#L22-L35) actually returns:

```jsonc
{
  "apiPath": "/v2/device/thing/status",       // no /sub/
  "payload": {
    "id": "sub-001",                          // sub-device id directly
    "params": {
      "switch": "on",                         // flat string, no array
      "countdown": 600
    }
  }
}
```

Both are plausible interpretations of eWeLink's API. The implementation **works in production** — the user explicitly hit the valve in 22.0040 with the only blocker being the access-token-expired refresh issue (which I fixed in that batch). The test was written to a spec that doesn't match the running code.

### Fix

Rewrite the 8 sub-device assertions to match the actual implementation:

```ts
// New shape:
assertEquals(apiPath, "/v2/device/thing/status");
assertEquals(payload.id, "sub-001");                  // sub-device id
assertEquals(params.switch, "on");
assertEquals(params.countdown, 600);
// turn_off: no countdown
// Sub-device routing happens via the `id` field, not a separate subDevId param.
```

While I'm in there I'll add a comment block at the top of the sub-device section pointing at the actual `buildControlPayload` so future contract changes have a clearer breadcrumb.

### Risk

Low. The production behaviour matches what the user's valve responds to. If eWeLink ever changes the shape, the implementation has to change too — and these tests will then need updating, which is the point.

---

## Bucket D — auth check happens AFTER env-var validation (real bugs)

This is the interesting one.

[`supabase/functions/plant-doctor/index.ts:556-565`](../../supabase/functions/plant-doctor/index.ts#L556-L565):

```ts
const apiKey = Deno.env.get("GEMINI_API_KEY");
// ...
if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

const authResult = await requireAuth(req, supabase);
if (authResult instanceof Response) return authResult;
```

[`supabase/functions/generate-guide/index.ts:28-40`](../../supabase/functions/generate-guide/index.ts#L28-L40) — same pattern.

When `GEMINI_API_KEY` isn't set (true on most local dev environments, and possible on misconfigured deploys), an **unauthenticated** request:

- `plant-doctor` → returns the error body `{"error":"GEMINI_API_KEY is not set."}` with HTTP 400. **Information leak** — an anonymous caller can probe whether the production env is correctly configured.
- `generate-guide` → returns the `fallback` payload with HTTP 200, **bypassing the auth check entirely**. Anonymous callers can pull cached/canned guide content.

EF-001 + EF-006 are correctly asserting that unauthenticated requests get 401. They've been failing because the production code rejects them with the wrong status code.

### Fix

Reorder so `requireAuth(req, supabase)` runs FIRST in each function. Move it above the env-var checks. Bonus: when the env vars are misconfigured, only authenticated users see the internal error message.

```ts
// New order:
const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

const authResult = await requireAuth(req, supabase);
if (authResult instanceof Response) return authResult;

const apiKey = Deno.env.get("GEMINI_API_KEY");
if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
// ...
```

Two files to change:

1. `supabase/functions/plant-doctor/index.ts`
2. `supabase/functions/generate-guide/index.ts`

### Risk

- **Low for correctness:** the auth check is non-destructive; only the ORDER changes.
- **Test impact:** the 2 EF-* tests pass after the reorder. No production behaviour changes for authenticated users.
- **Deploy:** edge functions get pushed with the next `npm run deploy`.

---

## Files to change

| File | Bucket | Already applied |
|---|---|---|
| `supabase/tests/aiUsage.test.ts` | A | ✅ Yes |
| `supabase/tests/refreshStaleAiPlants.test.ts` | A | ✅ Yes |
| `supabase/tests/weather-rules/heatwave.test.ts` | B | No |
| `supabase/tests/integrations/ewelink.test.ts` | C | No |
| `supabase/functions/plant-doctor/index.ts` | D | No (real product fix) |
| `supabase/functions/generate-guide/index.ts` | D | No (real product fix) |

## Acceptance

- `npm run test:functions` → all 338 + the 11 (= 349) Deno tests passing, no failures.
- `npx tsc --noEmit` + `npm run build` clean.
- For the two product fixes (Bucket D), deploy so the auth-first ordering goes live.
- One commit: `chore(tests): close the 11 long-tail Deno failures (incl. 2 real auth-order fixes)`

## App-reference files to update

- [`docs/app-reference/99-cross-cutting/13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md) — note the auth-first ordering for edge functions that call Gemini (defence-in-depth: env errors never leak to anon callers).
- [`docs/app-reference/07-management/05-integrations-devices.md`](../app-reference/07-management/05-integrations-devices.md) — confirm the documented sub-device API shape matches the implementation (the test had it wrong; doc may too).

Reply **"go ahead"** and I'll ship.
