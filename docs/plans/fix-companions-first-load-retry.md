# Fix — Companions tab fails on first load, works on Retry

## Symptom
Opening a plant's **Companions** tab fails the first time ("failed to get companion data"), but tapping **Retry** loads it fine. (Distinct from the earlier token-limit bug, which failed *every* time — that's fixed.)

## App-reference files consulted
- `docs/app-reference/03-garden-hub/12-senescence.md` / the plant edit + library preview surfaces hosting `CompanionPlantsTab`
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — `companion-planting`

## Root cause (transient first call)
`CompanionPlantsTab.fetchCompanions` calls `companion-planting` once on mount and, on any failure, immediately sets `fetch_failed` — no retry. "Works on Retry" is the signature of a **transient first-call failure**: most likely the edge function cold-starting and/or the Supabase auth token not yet attached on the very first `functions.invoke` right after navigating to the plant. By the time the user taps Retry (a second or two later) the function is warm and the session is ready, so it succeeds.

There's also a caching nuance: `companionCache` shares one promise between the Library "pre-warm" and the tab's mount-fetch. If the function returns a 200 with an `{ error }` body (resolved-with-error, *not* a rejection), the cache keeps that errored result, so a naive re-fetch would replay the same error — the cache must be invalidated before retrying.

## Fix (client-side, resilient)
In `CompanionPlantsTab.fetchCompanions`, auto-retry **once** before surfacing the error:
1. First attempt as today.
2. On failure (thrown error **or** a non-`ai_required` `data.error`), `invalidateCompanions(req)`, wait ~900 ms, and try again.
3. Only if the second attempt also fails → `setError("fetch_failed")`.

`ai_required` (the tier gate) still short-circuits immediately — no retry, it's not a transient failure. Import `invalidateCompanions` from `companionCache` (already exported).

This self-heals the first-load race regardless of the exact cause (cold start vs auth-attach) and also covers the case where the tab inherited a failed pre-warm promise. The visible Retry button stays as a manual fallback.

## Tests
- Unit: not practical (it's a timing/edge-fn race). Covered by manual/device verification.

## App-reference docs
- `12-senescence.md` / companions notes — mention the tab auto-retries once on first load before showing the error. (Light touch.)

## Risks
- Low. Adds at most one extra invoke + ~900 ms before showing an error that today appears immediately. `ai_required` is unaffected. Untestable here → verify on device.

## Deploy
Frontend-only. One deploy, then push to `main`.
