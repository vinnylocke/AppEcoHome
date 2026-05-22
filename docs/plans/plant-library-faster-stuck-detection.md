# Plan — faster detection + manual override for stuck runs

## What's happening

We shipped the heartbeat + auto-sweep in 12.0039, but the sweep cutoff is 10 minutes. So when a seed/verify function dies mid-flight, the admin page keeps showing "running" for up to 10 minutes before the sweep catches it. The user has to sit and wait.

Real batches take 2-5 seconds. A run that hasn't updated its heartbeat in even 60 seconds is almost certainly dead. The 10-minute number was conservative for the first ship — too conservative.

## Fix

### 1. Drop the cutoff to 3 minutes

3 minutes still gives massive headroom over the realistic batch time (~5s). Even a worst-case Gemini retry cascade (12 attempts) wouldn't push a batch beyond ~90 seconds. So 3 minutes of total silence on the heartbeat = the function is definitively dead.

### 2. Add a manual "Stop" button on running rows

Even with a 3-min sweep, sometimes the admin wants to fail a run RIGHT NOW (e.g. they triggered the wrong count, or know the batch is hosed). Add a small ✕ button on every `status='running'` row in the Recent Runs table. Click → confirm → UPDATE that row to `status='failed'` with `error_message='manually stopped by admin'` and `finished_at=now()`. The existing admin UPDATE RLS policy already lets the client do this directly — no new endpoint needed.

The actual edge-function background work might still be running for a few more seconds after the manual stop, but it'll see `status='failed'` on its next progress update and effectively become a no-op (the row is already in the terminal state).

## Files

| File | Change |
|------|--------|
| `src/services/plantLibraryAdminService.ts` | `STALE_RUN_CUTOFF_MS = 3 * 60 * 1000`; new `markRunAsFailed(runId)` helper |
| `src/components/admin/PlantLibraryAdmin.tsx` | Stop ✕ button on running rows in the Recent Runs table |

No schema changes, no edge function changes.

## Sequencing

Edit two files → typecheck → deploy. Quick fix.
