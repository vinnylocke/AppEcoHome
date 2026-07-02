# Plan — Kill the `deno.land/std` deploy-time fetch (migrate `serve` → `Deno.serve`)

## Problem / goal

`npm run deploy` step 4 (`supabase functions deploy --use-api --yes`) bundles **all
~80 edge functions server-side**, and for each one the bundler fetches every remote
import live. **52 function entry files** import the legacy HTTP server helper:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
```

When `deno.land`'s CDN is degraded, that fetch times out at 10s and **aborts the
entire deploy** — even when nothing about functions changed. It bit us twice in a
row this session on unrelated functions (`tts-speak`, then `parse-seed-packets`),
each time leaving **maintenance mode stuck ON** and forcing a manual
`node scripts/clear-maintenance.mjs`.

**Goal:** remove the only `deno.land` dependency in the codebase so the bundler has
nothing to fetch from that CDN, making full deploys reliable again.

## Root cause

`https://deno.land/std@0.168.0/http/server.ts` `serve()` is the *old* Deno HTTP
pattern. The Supabase edge runtime (and modern Deno) exposes a **built-in global
`Deno.serve()`** with an identical handler signature — **no import, no network
fetch at bundle time**. Supabase's own function templates moved to `Deno.serve`
some time ago; we're carrying a legacy import.

This is the only `deno.land` import in the repo. Confirmed by grep: the *only*
`deno.land/*` URL anywhere under `supabase/functions` is
`std@0.168.0/http/server.ts`, and it appears solely as the `serve` import in 52
`index.ts` entry files. `_shared/*` and everything else use `esm.sh` / `jsr`, not
`deno.land`.

## App-reference files consulted

- [`99-cross-cutting/31-deployment.md`](../app-reference/99-cross-cutting/31-deployment.md) — deploy pipeline (note: it documents the older 4-step flow; the real `deploy.mjs` is now 6 steps incl. functions deploy + version bake).
- [`99-cross-cutting/10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — edge-function inventory.

## Approach

Purely mechanical, identical in all 52 files:

1. **Delete** the import line:
   ```ts
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
   ```
2. **Rename** the one call site `serve(` → `Deno.serve(`:
   ```ts
   Deno.serve(async (req) => { … });
   ```

All 52 call sites use the bare `serve(async (req) => …)` form — **none** pass
std-specific options (verified by grep), so `Deno.serve` is a true drop-in. The
handler signature `(req: Request) => Response | Promise<Response>` is the same.

No `_shared/` files change (they don't import `serve`). No client code changes.

### Files changing

- **52 × `supabase/functions/<name>/index.ts`** — the two-line mechanical edit above.
  Full list is every entry file importing the std `serve` (companion-planting,
  plant-doctor, tts-speak, parse-seed-packets, predict-yield, app-help, … — the 52
  matched by the grep).
- **`docs/app-reference/99-cross-cutting/31-deployment.md`** — add a short
  "Edge function deployment" note: functions bundle server-side via
  `supabase functions deploy --use-api`; they use the runtime-native `Deno.serve`
  (no remote HTTP import) so the bundle has no `deno.land` fetch; mention
  `scripts/deploy-app-only.mjs` as the escape hatch for client-only / already-deployed-function ships.

### Out of scope (noted, not done)

- **`esm.sh` imports** (supabase-js, etc.) are *also* live deploy-time fetches and a
  theoretical future failure point — but esm.sh has been reliable and was never the
  failure. Pinning/vendoring those (via `deno.lock` + `--vendor`) is a larger,
  separate change. Not in this plan.
- **`scripts/deploy-app-only.mjs`** stays as a useful escape hatch even after this
  fix (e.g. client-only changes that shouldn't redeploy 80 functions).

## Verification

1. `deno check` on a representative converted function (e.g. `plant-doctor`, which
   has a `deno.json`/`deno.lock`) to confirm `Deno.serve` types resolve with no
   `serve` import.
2. `npm run test:functions` (Deno tests of `_shared`) — must stay green. The change
   is at the HTTP boundary, not in tested `_shared` logic, so no behavioural drift is
   expected; this is a regression guard.
3. **Canary deploy**: deploy 1–2 converted functions individually
   (`supabase functions deploy app-help predict-yield`), `curl` them, confirm 200 +
   expected JSON. This proves `Deno.serve` serves correctly in the edge runtime
   before converting the rest matters.
4. Then a normal `npm run deploy -- --bump N` — which should now sail through step 4
   with no `deno.land` fetch.

### Testing note (per CLAUDE.md)

This is an infrastructure / HTTP-boundary change with **no new pure logic** in
`src/lib`, `_shared` weather rules, or routes — so there is no unit/Deno/E2E test to
add; the correct verification is `deno check` + the canary smoke-hit above. No
existing test asserts the `serve` import, so none breaks.

## Risks / edge cases

- **`Deno.serve` vs std `serve` behaviour** — identical handler contract; Supabase
  officially recommends `Deno.serve`. Low risk. Caught by the canary before full
  rollout.
- **A stray call site with options** — none exist (grep-verified), but the edit is
  per-file so any oddball is visible during the change.
- **Rollback** — single `git revert` of the conversion commit; functions redeploy
  from the reverted source.

## App-reference files to update

- [`99-cross-cutting/31-deployment.md`](../app-reference/99-cross-cutting/31-deployment.md) — add the edge-function bundling / `Deno.serve` note described above.
