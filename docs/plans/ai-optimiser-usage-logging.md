# Plan — AI Optimiser Usage Logging

## Problem

`optimise-area-ai/index.ts` already calls `logAiUsage` and `enforceRateLimit`, but both calls use wrong positional arguments (passing the wrong values in the wrong positions). Neither will work at runtime.

Additionally, `optimise-area-ai` is not registered in `AIUsagePanel` or `tiers.ts`, so it won't appear in the per-function hourly limits display in the stats panel even after the logging is fixed.

## Changes

### 1. `supabase/functions/optimise-area-ai/index.ts`

Fix line 176 — `enforceRateLimit` call:
```typescript
// Wrong (req passed as db):
const rateLimitRes = await enforceRateLimit(req, db, userId, FN);
// Correct:
const rateLimitRes = await enforceRateLimit(db, userId, FN);
```

Fix line 395 — `logAiUsage` call:
```typescript
// Wrong (positional args, not awaited):
logAiUsage(db, userId, homeId, FN, usage);
// Correct:
await logAiUsage(db, { userId, homeId, functionName: FN, action: "optimise_area", usage });
```

### 2. `src/constants/tiers.ts`

Add `"optimise-area-ai"` to `HOURLY_RATE_LIMITS` and `FN_DISPLAY_NAMES`:
```typescript
"optimise-area-ai": { sprout: 0, botanist: 5, sage: 10, evergreen: 20 },
"optimise-area-ai": "AI Optimise",
```

### 3. `src/components/AIUsagePanel.tsx`

Add `"optimise-area-ai"` to the `AI_FUNCTIONS` array so it shows in the hourly limits row.

## Notes

- The `ai_usage_log` query in `AIUsagePanel` is already global (queries all rows for the home) — so the Today/Month/Cost stats will automatically include optimiser calls once the edge function bug is fixed.
- No migration needed — `ai_usage_log` table already exists.
- No frontend test changes needed — the panel's aggregate stats cover all functions.
