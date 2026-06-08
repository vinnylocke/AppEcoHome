# Plan — Golden Hour notifications: fix the sunset calculation

## Problem

Zero `golden_hour` notifications have ever been written. The `daily-batch-notifications` cron does call the Golden Hour code block, but the `sunsetUtc()` helper returns the wrong time — it computes sunrise instead of sunset because the NOAA hour-angle term has the wrong sign.

Confirmed by:
- DB query: `SELECT count(*) FROM notifications WHERE type='golden_hour'` → 0 across the whole DB
- Existing Deno tests in `supabase/tests/sunsetTime.test.ts` have been failing the whole time (the test for London midsummer expects sunset ~20:00–21:00 UTC; the function returns 03:43 UTC)

The cron's guard `if (sunset < now + 2h) skip` sees sunset "in the past" every morning (because it actually has today's sunrise), so the block silently exits.

## Root cause

`supabase/functions/_shared/sunsetTime.ts:48`:

```js
const sunsetMinUtc = 720 - 4 * (lng + (ha / DEG)) - eqtime;
//                                ^ should be MINUS
```

NOAA's standard formula for sunset is `solar_noon + 4*ha` (where ha is the positive hour angle, degrees). Sunrise is `solar_noon - 4*ha`. The code expanded `720 - 4*lng - 4*ha - eqtime` which is sunrise, not sunset.

## Fix

One-character change: `lng + (ha / DEG)` → `lng - (ha / DEG)`.

The result of that subtraction enters a negation outside: `720 - 4 * (lng - (ha / DEG)) - eqtime` = `720 - 4*lng + 4*ha - eqtime` = sunset.

## Files

| File | Change |
|------|--------|
| `supabase/functions/_shared/sunsetTime.ts` | The one-character sign flip |

## Tests

The existing `supabase/tests/sunsetTime.test.ts` already covers this — London + Sydney sunset cases that have been failing silently. After the fix they pass without changes.

## Deploy

The `_shared/sunsetTime.ts` module is imported by `daily-batch-notifications`. We need to redeploy that single edge function.

`supabase functions deploy daily-batch-notifications` (single-function form, no fleet hang).

No DB migration needed.

## Risks

- The sunset calc is also used by `_shared/sunsetTime.ts` consumers elsewhere — quick grep first to make sure no other call sites have been compensating for the bug (unlikely, given golden_hour count is zero).
- Once fixed, the next 07:00 UTC cron run will generate Golden Hour notifications for every home that has pending tasks and valid lat/lng. We should expect a one-time bump in push deliveries.
