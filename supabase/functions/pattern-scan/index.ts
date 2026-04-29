import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn } from "../_shared/logger.ts";
import { PATTERNS } from "../_shared/patterns/index.ts";

const FN = "pattern-scan";

serve(async (_req) => {
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Scan users who have had events in the last 7 days.
    // neglectedPlant will catch inactive users separately via planted_at threshold.
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [{ data: recentEventRows }, { data: allMembers }] = await Promise.all([
      db
        .from("user_events")
        .select("user_id")
        .gte("created_at", sevenDaysAgo),
      db
        .from("home_members")
        .select("user_id, home_id"),
    ]);

    const userIds = [...new Set((recentEventRows ?? []).map((r: any) => r.user_id as string))];

    // user_id -> first home_id
    const userHome = new Map<string, string>();
    for (const m of allMembers ?? []) {
      if (!userHome.has(m.user_id)) userHome.set(m.user_id, m.home_id);
    }

    let totalHits = 0;
    let totalErrors = 0;

    for (const userId of userIds) {
      const homeId = userHome.get(userId);
      if (!homeId) continue;

      for (const pattern of PATTERNS) {
        try {
          const hits = await pattern.detect(userId, homeId, db);

          // Fetch current unevaluated hits for stale-cleanup
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

          // Remove stale unevaluated hits that the pattern no longer produces
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

          // Upsert current hits
          for (const hit of hits) {
            const isItemHit = !!hit.inventoryItemId;
            const isBlueprintHit = !!hit.blueprintId && !hit.inventoryItemId;

            if (isItemHit) {
              // Item-level hit: upsert on the existing table UNIQUE constraint
              await db.from("user_pattern_hits").upsert(
                {
                  user_id: userId,
                  pattern_id: pattern.id,
                  inventory_item_id: hit.inventoryItemId,
                  raw_data: hit.rawData,
                  evaluated: false,
                  created_at: new Date().toISOString(),
                },
                { onConflict: "user_id,pattern_id,inventory_item_id" },
              );
            } else if (isBlueprintHit) {
              // Blueprint-level hit: partial unique index doesn't support JS upsert,
              // so manually check-and-update or insert.
              const { data: existing } = await db
                .from("user_pattern_hits")
                .select("id")
                .eq("user_id", userId)
                .eq("pattern_id", pattern.id)
                .eq("blueprint_id", hit.blueprintId!)
                .is("inventory_item_id", null)
                .maybeSingle();

              if (existing) {
                await db
                  .from("user_pattern_hits")
                  .update({
                    raw_data: hit.rawData,
                    evaluated: false,
                    created_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);
              } else {
                await db.from("user_pattern_hits").insert({
                  user_id: userId,
                  pattern_id: pattern.id,
                  blueprint_id: hit.blueprintId,
                  raw_data: hit.rawData,
                  evaluated: false,
                  created_at: new Date().toISOString(),
                });
              }
            }

            totalHits++;
          }
        } catch (err) {
          totalErrors++;
          warn(FN, "pattern_error", { pattern: pattern.id, userId, error: String(err) });
        }
      }
    }

    log(FN, "scan_complete", { users: userIds.length, hits: totalHits, errors: totalErrors });

    return new Response(
      JSON.stringify({ users: userIds.length, hits: totalHits, errors: totalErrors }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
