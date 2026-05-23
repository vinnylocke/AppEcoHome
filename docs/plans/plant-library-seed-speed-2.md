# Plan — make a batch fit in under 10 seconds

## Diagnosis

User ran 100 plants, function died after exactly 20 (1 batch × `BATCH_SIZE = 20`). That means the background task isn't surviving the SECOND batch at all. So a single batch is consuming most or all of the function's CPU/wall-clock budget.

Likely culprit: the Gemini cascade. With `maxRetriesPerModel = 3` and 6 models, a slow / overloaded batch can attempt up to 18 calls, each with up to 45s timeout, plus exponential backoff (2s, 4s, 6s). Worst case: minutes per batch. Even at "warm Gemini" speeds, a batch with a flaky first call retried 3× before moving to a slower model can easily eat 60+ seconds.

The previous fix (cut avoid list to 1500, drop image fetch) helped on the happy path but didn't change the cascade behaviour, which is what blows the budget when Gemini is loaded.

## Fix — go aggressive on per-batch caps

| Setting | Was | Now | Why |
|---|---|---|---|
| `BATCH_SIZE` | 20 | **10** | Half the response tokens → faster Gemini call (~5s vs 10s) |
| `INITIAL_AVOID_FETCH` | 1500 | **800** | Smaller prompt → faster input processing |
| `MAX_AVOID_LIST_SIZE` | 1500 | **800** | Same |
| `maxRetriesPerModel` | 3 | **1** | Fail-fast: 6 models × 1 attempt = 6 retries max, not 18 |
| `timeoutMs` (seed) | 45s default | **20s** | Don't sit on a stuck model for 45s; bail and cascade |

Worst-case batch time after this: 6 models × 20s = 120s (only if EVERY model is slow). Realistic: 5–10s. Single bad cascade still won't survive on its own, but it won't take the whole run with it either — the batch fails, the rest carry on.

## What this trades

- **Slightly more skipped duplicates.** 800 avoid entries instead of 1500. Still much better than the old 500 most-recent.
- **Slightly higher batch failure rate under heavy Gemini load.** A model that would have succeeded on retry 2 or 3 gets given up on. Acceptable — better to have 9/10 batches succeed than 1 batch die and take everything with it.
- **Less Gemini cascade resilience overall.** If you start seeing batch failures spike, we re-add retries selectively.

## What's next if this still isn't enough

If a 100-plant run still doesn't complete reliably, the problem is structural and we need **multi-invocation chunking** (Option B from the previous plan): each function call handles N plants, then schedules the next invocation to continue. That's a meaningful refactor but the right long-term answer for 1000-plant cron runs.

For now, this band-aid should get 100-plant manual runs reliable.

## Files

| File | Change |
|------|---------|
| `supabase/functions/seed-plant-library/index.ts` | Constants + Gemini call options |

No migration, no UI change.
