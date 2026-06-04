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

    // 1. Fetch pending tasks due today or earlier
    // We grab the date string in YYYY-MM-DD format to match your 'date' column
    const today = new Date().toISOString().split("T")[0];

    log(FN, "request_received", { today });

    const { data: pendingTasks, error: taskError } = await supabase
      .from("tasks")
      .select("id, home_id, title")
      .eq("status", "Pending")
      .lte("due_date", today);

    if (taskError) throw taskError;

    log(FN, "tasks_loaded", { count: pendingTasks?.length ?? 0, date: today });

    if (!pendingTasks || pendingTasks.length === 0) {
      return new Response(JSON.stringify({ message: "No tasks due today." }), {
        status: 200,
      });
    }

    // 2. Group the tasks by the Home they belong to
    const tasksByHome = pendingTasks.reduce((acc: any, task) => {
      // Your schema allows null home_id, so we safely skip those for now
      if (task.home_id) {
        if (!acc[task.home_id]) acc[task.home_id] = [];
        acc[task.home_id].push(task);
      }
      return acc;
    }, {});

    const homeIds = Object.keys(tasksByHome);
    if (homeIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No home-linked tasks found." }),
        { status: 200 },
      );
    }

    // 3. Find ALL users that live in these homes!
    const [{ data: homeMembers, error: memberError }, { data: userPlantPrefs }] = await Promise.all([
      supabase.from("home_members").select("user_id, home_id").in("home_id", homeIds),
      supabase.from("planner_preferences").select("user_id, entity_name").eq("entity_type", "plant").eq("sentiment", "positive"),
    ]);

    if (memberError) throw memberError;

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
    //
    // We send to every member; the client respects their own
    // `goldenHour` pref locally. Once notification prefs land server-
    // side these will check the column too.
    try {
      const { data: homesWithGeo } = await supabase
        .from("homes")
        .select("id, lat, lng, timezone")
        .in("id", homeIds);
      if (homesWithGeo && homesWithGeo.length > 0) {
        const nowMs = Date.now();
        const todayUtc = new Date();
        const goldenHourNotifs: any[] = [];
        for (const home of homesWithGeo) {
          const lat = Number((home as any).lat ?? NaN);
          const lng = Number((home as any).lng ?? NaN);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const sunset = sunsetUtc(todayUtc, lat, lng);
          if (!sunset) continue;
          if (sunset.getTime() < nowMs + 2 * 60 * 60 * 1000) continue;
          const sunsetLabel = formatSunsetLocal(sunset, (home as any).timezone);
          for (const member of homeMembers ?? []) {
            if (member.home_id !== home.id) continue;
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

    log(FN, "complete", { notificationsSent: notificationsToInsert.length, homesNotified: homeIds.length });

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
