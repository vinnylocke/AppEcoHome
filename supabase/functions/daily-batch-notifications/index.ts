import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { sunsetUtc, formatSunsetLocal } from "../_shared/sunsetTime.ts";
import { isTaskActionableToday } from "../_shared/taskFilters.ts";
import {
  categoryForTaskType,
  shouldNotify,
  type NotificationPrefs,
} from "../_shared/notificationPrefs.ts";
import { localMinutesOfDay, isReminderDue, isNearSunset } from "../_shared/notificationTiming.ts";

const FN = "daily-batch-notifications";

// Runs every 15 min (was a single 08:00 UTC fire). Each user's task digest is
// delivered at their chosen local `reminderTime` (default 08:00 local); golden
// hour fires ~45 min before each home's actual sunset. Rolling ~18 h per-user
// dedup keeps it to one of each per day regardless of timezone / reminder time.
const REMINDER_TICK_MIN = 15;
const DEDUP_MS = 18 * 60 * 60 * 1000;

function greetingForLocalMinutes(mins: number): string {
  if (mins < 12 * 60) return "Good Morning";
  if (mins < 18 * 60) return "Good Afternoon";
  return "Good Evening";
}

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const dedupSinceIso = new Date(now.getTime() - DEDUP_MS).toISOString();

    // 1. Cheap fetch first — homes, members, prefs (NO tasks yet; only pulled
    //    below for homes that actually have someone due now).
    const [
      { data: allMembers, error: memberError },
      { data: allHomes, error: homesError },
      { data: userPlantPrefs },
      { data: profileRows },
    ] = await Promise.all([
      supabase.from("home_members").select("user_id, home_id"),
      supabase.from("homes").select("id, lat, lng, timezone"),
      supabase.from("planner_preferences").select("user_id, entity_name").eq("entity_type", "plant").eq("sentiment", "positive"),
      supabase.from("user_profiles").select("uid, notification_prefs"),
    ]);
    if (memberError) throw memberError;
    if (homesError) throw homesError;

    const prefsByUser: Record<string, NotificationPrefs> = {};
    for (const row of (profileRows ?? []) as Array<{ uid: string; notification_prefs: NotificationPrefs | null }>) {
      prefsByUser[row.uid] = row.notification_prefs ?? {};
    }
    const homesById = new Map<string, { id: string; lat: number | null; lng: number | null; timezone: string | null }>();
    for (const h of (allHomes ?? []) as Array<{ id: string; lat: number | null; lng: number | null; timezone: string | null }>) {
      homesById.set(h.id, h);
    }
    const homeMembers = (allMembers ?? []) as Array<{ user_id: string; home_id: string }>;

    // 2. Rolling per-user dedup: who already got a digest / golden hour in ~18 h.
    const { data: recentNotifs } = await supabase
      .from("notifications")
      .select("user_id, type")
      .in("type", ["daily_batch", "golden_hour"])
      .gte("created_at", dedupSinceIso);
    const sentDigest = new Set<string>();
    const sentGolden = new Set<string>();
    for (const n of (recentNotifs ?? []) as Array<{ user_id: string; type: string }>) {
      if (n.type === "daily_batch") sentDigest.add(n.user_id);
      else if (n.type === "golden_hour") sentGolden.add(n.user_id);
    }

    // 3. Which members are due for a digest now (home-local reminder time)?
    const dueDigestMembers = homeMembers.filter((m) => {
      if (sentDigest.has(m.user_id)) return false;
      const prefs = prefsByUser[m.user_id] ?? {};
      if (prefs.master === false) return false;
      const tz = homesById.get(m.home_id)?.timezone ?? "UTC";
      const reminderTime = typeof prefs.reminderTime === "string" ? prefs.reminderTime : "08:00";
      return isReminderDue(localMinutesOfDay(now, tz), reminderTime, REMINDER_TICK_MIN);
    });

    const notificationsToInsert: Array<Record<string, unknown>> = [];

    // 4. Build the digest — only fetch tasks for homes with a due member.
    if (dueDigestMembers.length > 0) {
      const dueHomeIds = [...new Set(dueDigestMembers.map((m) => m.home_id))];
      const { data: pendingTasks } = await supabase
        .from("tasks")
        .select("id, home_id, title, type, due_date, next_check_at, window_end_date, status")
        .eq("status", "Pending")
        .in("home_id", dueHomeIds)
        .lte("due_date", today);
      const actionableTasks = (pendingTasks ?? []).filter((t: any) => isTaskActionableToday(t, today));
      const tasksByHome: Record<string, any[]> = {};
      for (const t of actionableTasks as any[]) {
        if (t.home_id) (tasksByHome[t.home_id] ??= []).push(t);
      }

      const prefsByPlannerUser: Record<string, Set<string>> = {};
      for (const pref of userPlantPrefs ?? []) {
        if (!pref.user_id) continue;
        (prefsByPlannerUser[pref.user_id] ??= new Set()).add(pref.entity_name.toLowerCase());
      }

      for (const member of dueDigestMembers) {
        const homeTasks = tasksByHome[member.home_id];
        if (!homeTasks || homeTasks.length === 0) continue;

        // Per-category mute respect (untyped tasks always count).
        const prefs = prefsByUser[member.user_id];
        const relevantTasks = (homeTasks as any[]).filter((task) => {
          const category = categoryForTaskType(task.type);
          if (!category) return true;
          return shouldNotify(prefs, category);
        });
        if (relevantTasks.length === 0) continue;

        // Featured plant from the user's planner favourites.
        const planterPrefs = prefsByPlannerUser[member.user_id];
        let featuredPlant: string | null = null;
        if (planterPrefs && planterPrefs.size > 0) {
          for (const task of relevantTasks) {
            const taskTitleLower = task.title.toLowerCase();
            for (const plantName of planterPrefs) {
              if (taskTitleLower.includes(plantName)) { featuredPlant = task.title; break; }
            }
            if (featuredPlant) break;
          }
        }

        const tz = homesById.get(member.home_id)?.timezone ?? "UTC";
        const greeting = greetingForLocalMinutes(localMinutesOfDay(now, tz));
        const title = `🌿 ${greeting}!`;
        const body = featuredPlant
          ? `Your ${featuredPlant} needs attention today!`
          : relevantTasks.length === 1
            ? `Your home has a pending task: ${relevantTasks[0].title}.`
            : `Your home has ${relevantTasks.length} plant care tasks waiting for you today!`;

        notificationsToInsert.push({
          user_id: member.user_id,
          home_id: member.home_id,
          title,
          body,
          type: "daily_batch",
          data: { route: "/schedule" },
          is_read: false,
        });
      }
    }

    // 5. Golden hour — fire ~45 min before each home's actual sunset.
    try {
      for (const home of (allHomes ?? []) as Array<{ id: string; lat: number | null; lng: number | null; timezone: string | null }>) {
        const lat = Number(home.lat ?? NaN);
        const lng = Number(home.lng ?? NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const sunset = sunsetUtc(now, lat, lng);
        if (!sunset || !isNearSunset(now, sunset)) continue;
        const sunsetLabel = formatSunsetLocal(sunset, home.timezone);
        for (const member of homeMembers) {
          if (member.home_id !== home.id) continue;
          if (sentGolden.has(member.user_id)) continue;
          if (!shouldNotify(prefsByUser[member.user_id], "goldenHour")) continue;
          sentGolden.add(member.user_id); // guard against multi-home double-add this run
          notificationsToInsert.push({
            user_id: member.user_id,
            home_id: home.id,
            title: "📷 Golden hour soon",
            body: `Sunset around ${sunsetLabel}. Lovely soft light coming for plant photos, deadheading and a calm evening watering.`,
            type: "golden_hour",
            data: { route: "/dashboard", sunset_iso: sunset.toISOString() },
            is_read: false,
          });
        }
      }
    } catch (err: any) {
      warn(FN, "golden_hour_failed", { error: err.message });
    }

    if (notificationsToInsert.length === 0) {
      return new Response(JSON.stringify({ message: "Nothing due this tick." }), { status: 200 });
    }

    const { error: insertError } = await supabase.from("notifications").insert(notificationsToInsert);
    if (insertError) throw insertError;

    log(FN, "complete", {
      sent: notificationsToInsert.length,
      dueDigestMembers: dueDigestMembers.length,
      homesTotal: allHomes?.length ?? 0,
    });
    return new Response(JSON.stringify({ success: true, sent: notificationsToInsert.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    await captureException(FN, error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
