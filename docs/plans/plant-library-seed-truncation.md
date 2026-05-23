# Plan — fix truncated-JSON failures in seed-plant-library

## Bug

Logs show `parse_failed` errors like:

```
"Unterminated string in JSON at position 25827 (line 718 column 14)"
```

Root cause: Gemini is hitting `maxOutputTokens: 8192` partway through generating the batch. The response is truncated mid-string, JSON.parse throws, the whole batch is wasted.

Per-plant output is ~400-600 tokens (description, multiple arrays, ~30 fields). At batch size 25 that's a max-case ~15,000 output tokens — almost double our budget. With the stricter prompt asking for EVERY applicable field populated, even median plants now push the budget.

## Fix

Two-line tweak in `seed-plant-library/index.ts`:

1. **Bump `maxOutputTokens` from 8192 to 32768.** Gemini Flash / Pro support up to 65535; 32k is comfortably ample for any realistic batch.
2. **Reduce `BATCH_SIZE` from 25 to 20.** Smaller batches = lower truncation risk + lower waste when a batch DOES fail. We trade ~25% more Gemini calls per run for substantially better reliability.

Combined: 20 plants × ~600 tokens worst-case = 12,000 tokens. Sits at 37% of the new budget. Plenty of headroom.

## Optional follow-up (skip for now)

Could surface Gemini's `finishReason` (e.g., `MAX_TOKENS`) in the error message to make this diagnosable without inspecting the JSON. Skipped — the fix prevents the failure, and the new error message would just confirm what we already know.

## Sequencing

Edit one file → deploy.
