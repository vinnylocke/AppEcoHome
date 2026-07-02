import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { log, warn } from "../_shared/logger.ts";
import { PATTERNS } from "../_shared/patterns/index.ts";
import { captureException } from "../_shared/sentry.ts";
import { pLimit } from "../_shared/concurrency.ts";
import { fetchAllPages } from "../_shared/pagedSelect.ts";

const FN = "pattern-scan";

// Per-user concurrency for the outer fan-out. 10 is conservative — each
// user kicks off ~4 pattern detectors + batched upserts, so 10 concurrent
// users is ~40 in-flight queries. Tune up if cron run-time stays low.
const USER_CONCURRENCY = 10;

// We only scan users with recent activity (events in the last 7 days).
// neglectedPlant catches inactive users separately via planted_at threshold.
const ACTIVITY_WINDOW_DAYS = 7;

serve(async (_req) => {
  try {
    const db = serviceClient();

    const activityCutoff = new Date(
      Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000,
    ).toISOString();

    // Paged: both are fleet scans — the un-ranged selects truncated at
    // PostgREST's max_rows=1000, so active users past the cap were never
    // scanned for patterns.
    const [recentEventRows, allMembers] = await Promise.all([
      fetchAllPages<{ user_id: string }>(() =>
        db
          .from("user_events")
          .select("user_id")
          .gte("created_at", activityCutoff)
          .order("created_at")
      ),
      fetchAllPages<{ user_id: string; home_id: string }>(() =>
        db
          .from("home_members")
          .select("user_id, home_id")
          .order("user_id")
      ),
    ]);

    const userIds = [
      ...new Set(recentEventRows.map((r) => r.user_id)),
    ];

    // user_id → first home_id (multi-home users get their oldest membership)
    const userHome = new Map<string, string>();
    for (const m of allMembers) {
      if (!userHome.has(m.user_id)) userHome.set(m.user_id, m.home_id);
    }

    const limit = pLimit(USER_CONCURRENCY);
    let totalHits = 0;
    let totalErrors = 0;

    // Fan out users in parallel with the concurrency cap. Each user runs
    // all patterns sequentially (patterns are cheap — 4 of them, each a
    // single DB read + a batched upsert), so the parallelism budget stays
    // dedicated to users.
    const userResults = await Promise.all(
      userIds.map((userId) =>
        limit(async () => {
          const homeId = userHome.get(userId);
          if (!homeId) return { hits: 0, errors: 0 };

          let userHits = 0;
          let userErrors = 0;

          for (const pattern of PATTERNS) {
            try {
              // Bridge the cross-version SupabaseClient (serviceClient @2.49.4 vs the
              // detector signature's @2.39.3) — same shape, different esm.sh pin.
              const hits = await pattern.detect(userId, homeId, db as unknown as Parameters<typeof pattern.detect>[2]);

              // Fetch existing unevaluated hits so we can clean up stale ones
              // (rows the detector no longer produces).
              const { data: existingHits } = await db
                .from("user_pattern_hits")
                .select("id, inventory_item_id, blueprint_id")
                .eq("user_id", userId)
                .eq("pattern_id", pattern.id)
                .eq("evaluated", false);

              const currentItemIds = new Set(
                hits.map((h) => h.inventoryItemId).filter(Boolean) as string[],
              );
              const currentBlueprintIds = new Set(
                hits.map((h) => h.blueprintId).filter(Boolean) as string[],
              );

              const staleIds = (existingHits ?? [])
                .filter((h: any) => {
                  if (h.inventory_item_id) return !currentItemIds.has(h.inventory_item_id);
                  if (h.blueprint_id) return !currentBlueprintIds.has(h.blueprint_id);
                  return false;
                })
                .map((h: any) => h.id);

              if (staleIds.length) {
                await db.from("user_pattern_hits").delete().in("id", staleIds);
              }

              // Split hits by which unique constraint they target. The
              // instance-level rows have (user_id, pattern_id, inventory_item_id)
              // unique; the blueprint-level rows have a partial unique index
              // (user_id, pattern_id, blueprint_id) WHERE inventory_item_id IS NULL.
              const itemRows = hits
                .filter((h) => !!h.inventoryItemId)
                .map((h) => ({
                  user_id: userId,
                  pattern_id: pattern.id,
                  inventory_item_id: h.inventoryItemId,
                  raw_data: h.rawData,
                  evaluated: false,
                  created_at: new Date().toISOString(),
                }));

              const bpRows = hits
                .filter((h) => !!h.blueprintId && !h.inventoryItemId)
                .map((h) => ({
                  user_id: userId,
                  pattern_id: pattern.id,
                  blueprint_id: h.blueprintId,
                  raw_data: h.rawData,
                  evaluated: false,
                  created_at: new Date().toISOString(),
                }));

              // Batch-upsert each group in a single round trip.
              if (itemRows.length > 0) {
                await db
                  .from("user_pattern_hits")
                  .upsert(itemRows, {
                    onConflict: "user_id,pattern_id,inventory_item_id",
                  });
              }

              if (bpRows.length > 0) {
                // Blueprint-level rows can't use JS upsert because the unique
                // constraint is partial. Pre-fetch existing IDs, then split into
                // updates vs inserts and run each as one batched query.
                const existingBpRows = (existingHits ?? []).filter(
                  (h: any) =>
                    h.blueprint_id && !h.inventory_item_id &&
                    currentBlueprintIds.has(h.blueprint_id),
                );
                const existingByBp = new Map<string, string>();
                for (const r of existingBpRows) {
                  existingByBp.set(r.blueprint_id, r.id);
                }

                const toInsert: typeof bpRows = [];
                const updateBatch: Array<{ id: string; raw_data: unknown; created_at: string }> = [];

                for (const row of bpRows) {
                  const existingId = existingByBp.get(row.blueprint_id as string);
                  if (existingId) {
                    updateBatch.push({
                      id: existingId,
                      raw_data: row.raw_data,
                      created_at: row.created_at,
                    });
                  } else {
                    toInsert.push(row);
                  }
                }

                if (toInsert.length > 0) {
                  await db.from("user_pattern_hits").insert(toInsert);
                }
                if (updateBatch.length > 0) {
                  // Bulk update via upsert-on-id (id is unique).
                  await db
                    .from("user_pattern_hits")
                    .upsert(
                      updateBatch.map((u) => ({
                        id: u.id,
                        raw_data: u.raw_data,
                        evaluated: false,
                        created_at: u.created_at,
                      })),
                      { onConflict: "id" },
                    );
                }
              }

              userHits += hits.length;
            } catch (err) {
              userErrors += 1;
              warn(FN, "pattern_error", {
                pattern: pattern.id,
                userId,
                error: String(err),
              });
            }
          }

          return { hits: userHits, errors: userErrors };
        }),
      ),
    );

    for (const r of userResults) {
      totalHits += r.hits;
      totalErrors += r.errors;
    }

    log(FN, "scan_complete", {
      users: userIds.length,
      hits: totalHits,
      errors: totalErrors,
      concurrency: USER_CONCURRENCY,
    });

    return new Response(
      JSON.stringify({
        users: userIds.length,
        hits: totalHits,
        errors: totalErrors,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
