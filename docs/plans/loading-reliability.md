# Plan — Loading reliability + speed

> "I seem to get lots of loading issues, this time when I loaded the app it said couldn't load dashboard data and asked me to do the garden quiz again."

## Diagnosed bugs

1. **Quiz prompt regresses on a failed read.** [`src/App.tsx:431-440`](../../src/App.tsx#L431) — when the `home_quiz_completions` query fails (network blip, transient 5xx), the effect resolves with `data: null` and runs `setQuizCompleted(!!null)` → `false`. The prompt then surfaces *"Take the Garden Quiz"* even though they already have. The fix: catch the error explicitly and keep `quizCompleted = null` (= "unknown") so the prompt stays hidden until we actually know.

2. **No retry on transient failures.** Every critical query (profile, dashboard, quiz, locations, weather) is a single attempt. A single network hiccup permanently breaks the state for that session — the user sees an error toast and has to manually retry or close+reopen. The user is reporting this is "frequent".

3. **`.single()` throws on null** and on transient errors. The profile query uses `.single()`, so a missing row throws even though it's a legitimate "row not yet created" state. The catch happens far away in the caller, surfacing as a generic profile-load error.

4. **No request timeout.** A hanging query (poor connection, cold-started edge fn, etc.) blocks forever. The UI just shows the loading spinner.

## Fix

### A — Stop the quiz regression (immediate)

```ts
// src/App.tsx — quiz completion effect
supabase
  .from("home_quiz_completions")
  .select("id")
  .eq("home_id", profile.home_id)
  .eq("user_id", session.user.id)
  .maybeSingle()
  .then(({ data, error }) => {
    if (error) {
      Logger.error("Quiz completion check failed (keeping unknown)", error);
      return;  // leave quizCompleted = null
    }
    setQuizCompleted(!!data);
  });
```

### B — Generic `withRetry` helper

New `src/lib/withRetry.ts`:
- `withRetry(fn, { retries = 2, baseDelayMs = 300, timeoutMs = 10_000 })`
- Wraps any async function (typically a Supabase call) with:
  - **Timeout**: races the inner promise against a `setTimeout` so a hanging query gives up at 10 s.
  - **Retry**: catches throwing errors and `{ error }` results, waits `baseDelayMs * 2^attempt`, retries up to `retries` times.
  - **Online-aware**: when `navigator.onLine === false`, waits for the `online` event before each attempt instead of immediately failing.
  - Returns the same shape the inner function returned (or throws on final failure).

Apply it to:
- `loadProfile` (profile + memberships)
- `fetchDashboardData` (the outer homes query)
- Quiz completion check
- Wherever else we have one-shot reads that gate UI state.

### C — Convert `.single()` → `.maybeSingle()` on the profile load

`.single()` throws when zero rows match. Using `.maybeSingle()` makes "row not present" a clean `null` rather than an error, so retries don't burn on a recoverable state.

### D — Defer the weather staleness check

The `fetchDashboardData` body fires a follow-up `sync-weather` invoke when the cached snapshot is > 6 h old. That call shouldn't block the dashboard render — it's already fire-and-forget but its result writes back to state and can race with the main render. Confirm it stays purely async and doesn't gate `setDashboardLoaded(true)`.

## Files

- `src/lib/withRetry.ts` (new) — the helper + Vitest cases (resolve first try, retry-then-resolve, retry-then-fail, timeout, online-aware).
- `src/App.tsx` — quiz effect catch; apply `withRetry` to `loadProfile` + `fetchDashboardData`; swap `.single()` to `.maybeSingle()` on profile.
- `tests/unit/lib/withRetry.test.ts` (new) — 5-6 cases covering the behaviour above.

## Risk

- A retry on a non-idempotent write would double-write. We're only wrapping READS — explicitly. The helper docs make this clear.
- Slow but successful queries that take > 10 s will be retried unnecessarily. 10 s is generous for a Supabase read; tune down later if logs show false positives.

## Out of scope this wave

- Realtime channel reconnection logic — separate concern.
- Local-first caching that lets the dashboard paint instantly from disk while the network catches up. Worth doing later; meaningful refactor.

## Sequencing

1. `withRetry` helper + tests.
2. Quiz catch fix.
3. Apply `withRetry` to `loadProfile` + `fetchDashboardData`. Swap `.single()` → `.maybeSingle()` on profile.
4. Typecheck + tests + deploy.
