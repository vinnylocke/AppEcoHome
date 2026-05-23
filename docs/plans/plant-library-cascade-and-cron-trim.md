# Plan — expand Gemini cascade + pause verify cron

## What changes

### 1. Add two more models to the cascade

User's ask: include the Gemini 2.5 range. `gemini-2.5-flash-lite` is already in `DEFAULT_MODELS`. Add the remaining two:

- `gemini-2.5-flash` — mid-tier 2.5
- `gemini-2.5-pro` — capable 2.5

(There's no "2.5 flash pro" model — interpreting that as `gemini-2.5-pro`.)

Cascade order from cheapest/fastest to most capable:

1. `gemini-3.1-flash-lite`
2. `gemini-2.5-flash-lite`  *(already there)*
3. `gemini-2.5-flash`  *(NEW)*
4. `gemini-3-flash-preview`
5. `gemini-2.5-pro`  *(NEW)*
6. `gemini-3.1-pro-preview`

Six models × three retries = up to 18 attempts before a batch is given up. Strong resilience against transient overloads.

### 2. Pause the daily verify cron

User wants to focus on populating the database first. Drop the `plant-library-verify-daily` cron schedule, but leave the edge function deployed so admin can still trigger manual verify runs from `/admin/plant-library`.

The seed cron stays at 02:00 UTC with `count = 1000`.

Migration uses `cron.unschedule` wrapped in a safe conditional so re-running doesn't error.

## Files

| File | Change |
|------|--------|
| `supabase/functions/_shared/gemini.ts` | Add two model ids to `DEFAULT_MODELS` |
| `supabase/migrations/<ts>_plant_library_pause_verify_cron.sql` | `cron.unschedule('plant-library-verify-daily')` |
| `docs/app-reference/99-cross-cutting/11-cron-jobs.md` | Update the verify entry to note it's manual-only |

## Sequencing

Edit gemini.ts + migration → typecheck → deploy. Doc tweak alongside.
