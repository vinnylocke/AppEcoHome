import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { sunsetUtc, formatSunsetLocal } from "../_shared/sunsetTime.ts";

const FN = "daily-batch-notifications";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split("T")[0];
    log(FN, "request_received", { today });

    // 1. Fetch every active home (with members) up front. We need this
    //    list for Golden Hour regardless of whether anyone has pending
    //    tasks today — Golden Hour was previously gated on task presence,
    //    which silently suppressed it for plenty of homes.
    const [
      { data: allMembers, error: memberError },
      { data: allHomes, error: homesError },
      { data: pendingTasks, error: taskError },
      { data: userPlantPrefs },
    ] = await Promise.all([
      supabase.from("home_members").select("user_id, home_id"),
      supabase.from("homes").select("id, lat, lng, timezone"),
      supabase.from("tasks").select("id, home_id, title").eq("status", "Pending").lte("due_date", today),
      supabase.from("planner_preferences").select("user_id, entity_name").eq("entity_type", "plant").eq("sentiment", "positive"),
    ]);

    if (memberError) throw memberError;
    if (homesError) throw homesError;
    if (taskError) throw taskError;

    log(FN, "loaded", {
      members: allMembers?.length ?? 0,
      homes: allHomes?.length ?? 0,
      pendingTasks: pendingTasks?.length ?? 0,
    });

    // Keep `homeMembers` as the variable the rest of the function uses —
    // semantically it's now "all home members across the org" which is
    // what we want for Golden Hour.
    const homeMembers = allMembers ?? [];

    // 2. Group pending tasks by home. Empty groups are fine; the
    //    daily_batch loop below short-circuits per-member when the
    //    home has no tasks.
    const tasksByHome: Record<string, any[]> = (pendingTasks ?? []).reduce(
      (acc: Record<string, any[]>, task: any) => {
        if (task.home_id) {
          if (!acc[task.home_id]) acc[task.home_id] = [];
          acc[task.home_id].push(task);
        }
        return acc;
      },
      {},
    );
    const homeIds = Object.keys(tasksByHome);

    // Build a quick lookup: userId → Set of preferred plant names (lowercase)
    const prefsByUser: Record<string, Set<string>> = {};
    for (const pref of userPlantPrefs ?? []) {
      if (!pref.user_id) continue;
      if (!prefsByUser[pref.user_id]) prefsByUser[pref.user_id] = new Set();
      prefsByUser[pref.user_id].add(pref.entity_name.toLowerCase());
    }

    // 4. Create a notification for EVERY person in the home
    //    Skip users who already received a daily_batch notification today.
    const { data: todayBatch } = await supabase
      .from("notifications")
      .select("user_id")
      .eq("type", "daily_batch")
      .gte("created_at", today + "T00:00:00Z");
    const alreadySent = new Set((todayBatch ?? []).map((n: any) => n.user_id));

    const notificationsToInsert = [];

    for (const member of homeMembers) {
      if (alreadySent.has(member.user_id)) continue;
      const homeTasks = tasksByHome[member.home_id];
      if (!homeTasks || homeTasks.length === 0) continue;

      // Check if any task title mentions one of this user's preferred plants
      const userPrefs = prefsByUser[member.user_id];
      let featuredPlant: string | null = null;
      if (userPrefs && userPrefs.size > 0) {
        for (const task of homeTasks) {
          const taskTitleLower = task.title.toLowerCase();
          for (const plantName of userPrefs) {
            if (taskTitleLower.includes(plantName)) {
              featuredPlant = task.title;
              break;
            }
          }
          if (featuredPlant) break;
        }
      }

      const title = "🌿 Good Morning!";
      const body = featuredPlant
        ? `Your ${featuredPlant} needs attention today!`
        : homeTasks.length === 1
          ? `Your home has a pending task: ${homeTasks[0].title}.`
          : `Your home has ${homeTasks.length} plant care tasks waiting for you today!`;

      notificationsToInsert.push({
        user_id: member.user_id,
        home_id: member.home_id,
        title: title,
        body: body,
        type: "daily_batch",
        data: { route: "/schedule" },
        is_read: false,
      });
    }

    // ── Wave 21.B — Golden Hour notifications ──────────────────────────
    //
    // For every home with a lat/lng, compute today's sunset and queue a
    // golden_hour notification per member. Skip when:
    //   - the home has no lat/lng (can't compute)
    //   - sunset is in the past or within 2h of now (user missed it)
    //   - the polar circles don't have a sunset today (sunsetUtc returns null)
    //   - the member already has a golden_hour row created today
    //     (idempotent re-runs / manual triggers shouldn't duplicate)
    //
    // We send to every member; the client respects their own
    // `goldenHour` pref locally. Once notification prefs land server-
    // side these will check the column too.
    try {
      const { data: todayGolden } = await supabase
        .from("notifications")
        .select("user_id")
        .eq("type", "golden_hour")
        .gte("created_at", today + "T00:00:00Z");
      const goldenAlreadySent = new Set((todayGolden ?? []).map((n: any) => n.user_id));

      if (allHomes && allHomes.length > 0) {
        const nowMs = Date.now();
        const todayUtc = new Date();
        const goldenHourNotifs: any[] = [];
        for (const home of allHomes) {
          const lat = Number((home as any).lat ?? NaN);
          const lng = Number((home as any).lng ?? NaN);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const sunset = sunsetUtc(todayUtc, lat, lng);
          if (!sunset) continue;
          if (sunset.getTime() < nowMs + 2 * 60 * 60 * 1000) continue;
          const sunsetLabel = formatSunsetLocal(sunset, (home as any).timezone);
          for (const member of homeMembers) {
            if (member.home_id !== home.id) continue;
            if (goldenAlreadySent.has(member.user_id)) continue;
            goldenHourNotifs.push({
              user_id: member.user_id,
              home_id: home.id,
              title: "📷 Golden hour later",
              body: `Sunset around ${sunsetLabel}. Great soft light for plant photos, deadheading, and a calm evening watering.`,
              type: "golden_hour",
              data: { route: "/dashboard", sunset_iso: sunset.toISOString() },
              is_read: false,
            });
          }
        }
        if (goldenHourNotifs.length > 0) {
          notificationsToInsert.push(...goldenHourNotifs);
        }
      }
    } catch (err: any) {
      warn(FN, "golden_hour_failed", { error: err.message });
    }

    if (notificationsToInsert.length === 0) {
      return new Response(
        JSON.stringify({ message: "No notifications to send." }),
        { status: 200 },
      );
    }

    // 5. Insert into notifications, triggering our push webhook
    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notificationsToInsert);

    if (insertError) throw insertError;

    log(FN, "complete", {
      notificationsSent: notificationsToInsert.length,
      homesWithTasks: homeIds.length,
      homesTotal: allHomes?.length ?? 0,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    await captureException(FN, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
