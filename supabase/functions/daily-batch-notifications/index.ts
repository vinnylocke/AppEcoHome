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
import { localMinutesOfDay, localDateInTz, isReminderDue, isNearSunset } from "../_shared/notificationTiming.ts";
import { fetchAllPages } from "../_shared/pagedSelect.ts";

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
    const dedupSinceIso = new Date(now.getTime() - DEDUP_MS).toISOString();

    // 1. Cheap fetch first — homes, members, prefs (NO tasks yet; only pulled
    //    below for homes that actually have someone due now). Paged: these
    //    are whole-table fleet scans, and PostgREST silently truncates
    //    un-ranged selects at max_rows=1000 — user #1001 never got a digest.
    const [allMembers, allHomes, userPlantPrefs, profileRows] = await Promise.all([
      fetchAllPages(() => supabase.from("home_members").select("user_id, home_id").order("user_id")),
      fetchAllPages(() => supabase.from("homes").select("id, lat, lng, timezone").order("id")),
      fetchAllPages(() =>
        supabase.from("planner_preferences").select("user_id, entity_name")
          .eq("entity_type", "plant").eq("sentiment", "positive").order("user_id")
      ),
      fetchAllPages(() => supabase.from("user_profiles").select("uid, notification_prefs").order("uid")),
    ]);

    const prefsByUser: Record<string, NotificationPrefs> = {};
    for (const row of (profileRows ?? []) as Array<{ uid: string; notification_prefs: NotificationPrefs | null }>) {
      prefsByUser[row.uid] = row.notification_prefs ?? {};
    }
    const homesById = new Map<string, { id: string; lat: number | null; lng: number | null; timezone: string | null }>();
    for (const h of (allHomes ?? []) as Array<{ id: string; lat: number | null; lng: number | null; timezone: string | null }>) {
      homesById.set(h.id, h);
    }
    const homeMembers = (allMembers ?? []) as Array<{ user_id: string; home_id: string }>;

    // 2. Rolling per-user pre-filter: who already got a digest / golden hour
    //    in ~18 h. This is a cheap work-avoidance pass only — the atomic
    //    send-once guarantee is the notification_claims insert in step 6.
    //    Paged + error-checked: the old unchecked, unbounded read failed
    //    OPEN on a transient error and truncated at 1000 rows, both of
    //    which re-notified users.
    const recentNotifs = await fetchAllPages<{ user_id: string; type: string }>(() =>
      supabase
        .from("notifications")
        .select("user_id, type")
        .in("type", ["daily_batch", "golden_hour"])
        .gte("created_at", dedupSinceIso)
        .order("created_at", { ascending: false })
    );
    const sentDigest = new Set<string>();
    const sentGolden = new Set<string>();
    for (const n of recentNotifs) {
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

      // Per-home LOCAL dates: the digest fires at the user's local reminder
      // time, but dueness was judged against the UTC date — a UTC+10 user's
      // 08:00 digest ran at 22:00 UTC *yesterday* and excluded tasks due on
      // their actual today, every single day.
      const localDateByHome = new Map<string, string>();
      for (const hid of dueHomeIds) {
        localDateByHome.set(hid, localDateInTz(now, homesById.get(hid)?.timezone ?? "UTC"));
      }
      const maxLocalDate = [...localDateByHome.values()].sort().pop()!;

      const { data: pendingTasks } = await supabase
        .from("tasks")
        .select("id, home_id, title, type, due_date, next_check_at, window_end_date, status")
        .eq("status", "Pending")
        .in("home_id", dueHomeIds)
        .lte("due_date", maxLocalDate);
      const tasksByHome: Record<string, any[]> = {};
      for (const t of (pendingTasks ?? []) as any[]) {
        if (!t.home_id) continue;
        const localToday = localDateByHome.get(t.home_id)!;
        if (t.due_date > localToday) continue;
        if (!isTaskActionableToday(t, localToday)) continue;
        (tasksByHome[t.home_id] ??= []).push(t);
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

    // 6. Atomic send-once claim BEFORE the insert (the insert is the
    //    side-effect — push-webhook fans out on it). The pre-filter in
    //    step 2 is read-then-write and therefore racy: two overlapping
    //    invocations both saw "not sent" and double-pushed. Claiming
    //    (user, kind, local date) via ON CONFLICT DO NOTHING lets exactly
    //    one run win each key; a claim failure throws (fail closed, no
    //    duplicate spray). In-run dedupe first: a user in N homes gets one
    //    digest (first home wins) instead of N-or-one depending on timing.
    const seenKeys = new Set<string>();
    const deduped = notificationsToInsert.filter((n) => {
      const key = `${n.user_id}:${n.type}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    const claimRows = deduped.map((n) => ({
      user_id: n.user_id,
      kind: n.type,
      claim_date: localDateInTz(now, homesById.get(n.home_id as string)?.timezone ?? "UTC"),
    }));
    const { data: wonClaims, error: claimError } = await supabase
      .from("notification_claims")
      .upsert(claimRows, { onConflict: "user_id,kind,claim_date", ignoreDuplicates: true })
      .select("user_id, kind");
    if (claimError) throw claimError;
    const wonKeys = new Set((wonClaims ?? []).map((w) => `${w.user_id}:${w.kind}`));
    const toSend = deduped.filter((n) => wonKeys.has(`${n.user_id}:${n.type}`));

    if (toSend.length > 0) {
      const { error: insertError } = await supabase.from("notifications").insert(toSend);
      if (insertError) throw insertError;
    }

    // Housekeeping: claims are only meaningful for the dedup horizon.
    await supabase
      .from("notification_claims")
      .delete()
      .lt("claim_date", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

    log(FN, "complete", {
      sent: toSend.length,
      claimedOut: deduped.length - toSend.length,
      dueDigestMembers: dueDigestMembers.length,
      homesTotal: allHomes.length,
    });
    return new Response(JSON.stringify({ success: true, sent: toSend.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    await captureException(FN, error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
