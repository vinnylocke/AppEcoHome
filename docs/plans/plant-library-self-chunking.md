# Plan — self-chunking seeder

## Goal

A 100-plant (or 1000-plant) run survives the per-invocation budget of a Supabase edge function by splitting itself into a chain of small invocations.

## Design

`seed-plant-library` body changes:

```ts
{
  count: number,                    // remaining plants to seed
  triggered_by?: string,            // user id (cron = null) — only on first call
  run_id?: string,                  // continuation marker — present for chunk 2+
}
```

**First call (no `run_id`):**
1. Insert a `plant_library_runs` row, capture `run_id`.
2. Return `{ run_id }` HTTP response immediately (202).
3. In `EdgeRuntime.waitUntil`: do ONE CHUNK (`CHUNK_SIZE = 30` plants), then call self for continuation.

**Continuation call (has `run_id`):**
1. Fetch the run row to check it's still `status = 'running'` (admin may have killed it).
2. Do one chunk of work.
3. If `remaining > 0` after the chunk → POST to self with `{ count: remaining, run_id }`. Fire-and-forget.
4. If `remaining <= 0` → mark run finished (succeeded / partial based on counts).

Chunk size of 30 = 3 batches × 10 plants. ~30s of work per invocation. Comfortable inside the wall-clock cap.

For 100 plants → ~4 invocations chained. For 1000 → ~34 invocations. Each starts cold but the chain is reliable.

## Self-invocation mechanics

The function POSTs to its own public URL with the continuation body. Auth: cron uses the publishable key (verify_jwt is off for this fn) so self-calls work without an auth header.

```ts
async function scheduleContinuation(runId: string, remaining: number) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/seed-plant-library`;
  // Fire-and-forget — we don't want to wait for the response.
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: remaining, run_id: runId }),
  }).catch(() => { /* let the dispatched call own its own errors */ });
}
```

Called at the end of `backgroundSeed` before the function returns.

## Handling continuation correctly

Currently `backgroundSeed` does all the work for the whole `count`. Split into:

- `runOneChunk(db, apiKey, runId, chunkSize, avoid)` — does ONE chunk worth of batches and returns the updated avoid list + remaining count delta.
- `backgroundSeed(db, apiKey, runId, totalCount)` — calls `runOneChunk` for `Math.min(CHUNK_SIZE, totalCount)` plants, then if more remaining schedules a continuation.

The avoid list rebuilds from scratch on each chunk (fetch random sample again). Slight loss vs running list, but each chunk's batches still get the in-chunk accumulation. And the random sample changes each call, exposing AI to different parts of the library — actually helps dedup over the long run.

## Stopping

If the admin manually stops the run via the ✕ button (sets `status='failed'`), the next continuation call should bail. Add a status check at the top of every continuation:

```ts
const { data: row } = await db
  .from("plant_library_runs")
  .select("status")
  .eq("id", runId)
  .single();
if (row?.status !== "running") {
  log("continuation skipped — run no longer running", ...);
  return;
}
```

## Failure modes

- **A continuation invocation fails to launch (network blip)** — the chain breaks. The run row stays `running` with stale heartbeat → admin sweep auto-marks failed after 3 min. Acceptable; admin re-triggers if they want more.
- **Self-fetch throws synchronously** — caught + logged. Same outcome.
- **A chunk succeeds but the function dies before scheduling the next** — same as above. Heartbeat stale → swept. We don't lose data; just the chain stops.

## Files

| File | Change |
|------|---------|
| `supabase/functions/seed-plant-library/index.ts` | Add `run_id` continuation param; split backgroundSeed into chunk + dispatcher; add scheduleContinuation helper |

No migration, no UI change, no admin-side changes. The cron payload still works (`{ count: 1000 }` → triggers chain).

## What this trades

- **Cold start per chunk** — adds ~100-300ms per invocation overhead. For 100 plants that's ~1s total. Negligible.
- **Avoid list rebuilds per chunk** — small extra DB round-trip per continuation. Negligible.
- **Net: same total work, just split across multiple invocations that each fit.**

## Sequencing

Edit one file → typecheck → deploy.
