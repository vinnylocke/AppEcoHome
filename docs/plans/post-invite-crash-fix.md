# Plan — Fix post-invite crash (TierSelection not imported)

## Problem

After a beta user clicks their invite link and creates a home, the app shows "Something went wrong".

Root cause: `src/App.tsx` references `<TierSelection>` at line 667 but does not import it. When a new invited user has `home_id` set but no `subscription_tier`, this code path is reached, throws `ReferenceError: TierSelection is not defined`, and the Sentry ErrorBoundary catches it and renders the error page.

`src/components/TierSelection.tsx` exists and exports `TierSelection` as a default export — it just needs to be imported.

## Fix

Add `TierSelection` to the lazy imports block in `src/App.tsx` (alongside the other heavy route components):

```ts
const TierSelection = lazy(() => import("./components/TierSelection"));
```

Wrap the `<TierSelection>` JSX in a `<Suspense>` fallback (a spinner) so lazy loading doesn't crash if the chunk isn't ready — consistent with how other lazy components are used in the file.

## Files changed

- `src/App.tsx` — add lazy import, wrap render in Suspense

## Risk

Low. Adding an import for an existing component. The Suspense fallback is a one-liner already used elsewhere in the file.

## No migration needed

`subscription_tier` already exists on `user_profiles`. Existing users are unaffected.
