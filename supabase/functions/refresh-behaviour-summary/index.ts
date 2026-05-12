import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";

const FN = "refresh-behaviour-summary";
const WINDOW_DAYS = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    // Service role client — bypasses RLS to read all users' events.
    const db = createClient(supabaseUrl, serviceKey);

    const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    log(FN, "run_start", { windowStart });

    // Fetch all events in the rolling window.
    const { data: events, error: eventsErr } = await db
      .from("user_events")
      .select("user_id, event_type, meta, created_at")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false });

    if (eventsErr) throw eventsErr;

    const raw: any[] = events ?? [];

    // Aggregate per user.
    type Agg = {
      completed: number;
      postponed: number;
      skipped: number;
      typeCounts: Record<string, number>;
      plantsAdded: number;
      aiChatCount: number;
      lastActiveAt: string | null;
    };

    const byUser = new Map<string, Agg>();

    for (const e of raw) {
      const uid = e.user_id as string;
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          completed: 0,
          postponed: 0,
          skipped: 0,
          typeCounts: {},
          plantsAdded: 0,
          aiChatCount: 0,
          lastActiveAt: null,
        });
      }
      const agg = byUser.get(uid)!;

      // Track most recent event per user.
      if (!agg.lastActiveAt || e.created_at > agg.lastActiveAt) {
        agg.lastActiveAt = e.created_at;
      }

      switch (e.event_type) {
        case "TASK_COMPLETED": {
          agg.completed++;
          const t = e.meta?.task_type as string | undefined;
          if (t) agg.typeCounts[t] = (agg.typeCounts[t] ?? 0) + 1;
          break;
        }
        case "TASK_POSTPONED":
          agg.postponed++;
          break;
        case "TASK_SKIPPED":
          agg.skipped++;
          break;
        case "PLANT_ADDED":
        case "INVENTORY_ADDED":
          agg.plantsAdded++;
          break;
        case "AI_CHAT_SENT":
          agg.aiChatCount++;
          break;
      }
    }

    if (byUser.size === 0) {
      log(FN, "run_complete", { usersUpdated: 0, reason: "no_events_in_window" });
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Build upsert rows.
    const computedAt = new Date().toISOString();
    const rows = Array.from(byUser.entries()).map(([userId, agg]) => {
      const total = agg.completed + agg.postponed + agg.skipped;
      const postponeRate = total > 0
        ? Math.round((agg.postponed / total) * 10_000) / 10_000
        : 0;

      const topTaskTypes = Object.entries(agg.typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => type);

      return {
        user_id: userId,
        window_days: WINDOW_DAYS,
        tasks_completed: agg.completed,
        tasks_postponed: agg.postponed,
        tasks_skipped: agg.skipped,
        postpone_rate: postponeRate,
        top_task_types: topTaskTypes,
        plants_added: agg.plantsAdded,
        ai_chat_count: agg.aiChatCount,
        last_active_at: agg.lastActiveAt,
        computed_at: computedAt,
      };
    });

    const { error: upsertErr } = await db
      .from("user_behaviour_summary")
      .upsert(rows, { onConflict: "user_id" });

    if (upsertErr) throw upsertErr;

    log(FN, "run_complete", { usersUpdated: rows.length });

    return new Response(JSON.stringify({ updated: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
