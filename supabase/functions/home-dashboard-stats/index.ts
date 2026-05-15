import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";
import { log } from "../_shared/logger.ts";

const FN = "home-dashboard-stats";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const { homeId, weekStart, weekEnd, today } = await req.json();
    if (!homeId || !weekStart || !weekEnd || !today) {
      return json({ error: "homeId, weekStart, weekEnd, today required" }, 400);
    }

    // Verify membership
    const { data: membership } = await db
      .from("home_members")
      .select("role")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return json({ error: "not_a_member" }, 403);

    log(FN, "start", { homeId, weekStart, weekEnd, today });

    // ── Run all queries in parallel ─────────────────────────────────────────
    const [
      tasksResult,
      membersResult,
      automationRunsResult,
      yieldResult,
      pruningResult,
      inventoryResult,
      weatherResult,
      doctorResult,
      ailmentsResult,
    ] = await Promise.all([
      // 1. Tasks this week — all relevant columns for grouping
      db
        .from("tasks")
        .select("id, status, type, due_date, completed_by, auto_completed_reason")
        .eq("home_id", homeId)
        .gte("due_date", weekStart)
        .lte("due_date", weekEnd),

      // 2. Home members (user_ids only — profiles fetched separately)
      db
        .from("home_members")
        .select("user_id, role")
        .eq("home_id", homeId),

      // 3. Automation runs this week
      db
        .from("automation_runs")
        .select("id, status, tasks_completed")
        .eq("home_id", homeId)
        .gte("triggered_at", weekStart)
        .lte("triggered_at", weekEnd),

      // 4. Yield records this week
      db
        .from("yield_records")
        .select("id, instance_id, value, unit")
        .eq("home_id", homeId)
        .gte("harvested_at", weekStart)
        .lte("harvested_at", weekEnd),

      // 5. Pruning records this week
      db
        .from("pruning_records")
        .select("id, instance_id")
        .eq("home_id", homeId)
        .gte("pruned_at", weekStart)
        .lte("pruned_at", weekEnd),

      // 6. Inventory items (active counts + new this week)
      db
        .from("inventory_items")
        .select("id, status, created_at")
        .eq("home_id", homeId)
        .in("status", ["In Shed", "Planted", "Germinating"]),

      // 7. Weather: alerts + snapshot for rainfall
      Promise.all([
        db
          .from("weather_alerts")
          .select("id, type, severity, is_active, starts_at")
          .eq("home_id", homeId)
          .gte("starts_at", weekStart),
        db
          .from("weather_snapshots")
          .select("data")
          .eq("home_id", homeId)
          .maybeSingle(),
      ]),

      // 8. Plant doctor sessions this week
      db
        .from("plant_doctor_sessions")
        .select("id")
        .eq("home_id", homeId)
        .gte("created_at", weekStart)
        .lte("created_at", weekEnd),

      // 9. New watchlist ailments this week
      db
        .from("ailments")
        .select("id")
        .eq("home_id", homeId)
        .eq("is_archived", false)
        .gte("created_at", weekStart)
        .lte("created_at", weekEnd),
    ]);

    // Fetch user profiles for member display names
    const rawMembers = (membersResult.data ?? []) as Array<{ user_id: string; role: string }>;
    const memberUserIds = rawMembers.map((m) => m.user_id);
    const { data: profileRows } = memberUserIds.length > 0
      ? await db
          .from("user_profiles")
          .select("uid, display_name, first_name, email")
          .in("uid", memberUserIds)
      : { data: [] };

    // ── Tasks aggregation ───────────────────────────────────────────────────
    const tasks = tasksResult.data ?? [];
    const taskTotal = tasks.length;
    const taskCompleted = tasks.filter((t) => t.status === "Completed").length;
    const taskAutoCompleted = tasks.filter(
      (t) => t.status === "Completed" && t.auto_completed_reason,
    ).length;
    const taskSkippedByRain = tasks.filter(
      (t) =>
        t.status === "Skipped" &&
        t.auto_completed_reason?.toLowerCase().includes("rain"),
    ).length;
    const taskOverdue = tasks.filter(
      (t) => t.due_date < today && !["Completed", "Skipped"].includes(t.status),
    ).length;
    const taskPending = tasks.filter(
      (t) => t.due_date >= today && !["Completed", "Skipped"].includes(t.status),
    ).length;
    const completionRate =
      taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0;

    // By category
    const taskByCategory: Record<string, number> = {};
    for (const t of tasks) {
      const cat = t.type ?? "Other";
      taskByCategory[cat] = (taskByCategory[cat] ?? 0) + 1;
    }

    // Per-member breakdown — completed tasks only
    const profileMap: Record<string, string> = {};
    for (const p of (profileRows ?? []) as Array<{ uid: string; display_name: string | null; first_name: string | null; email: string | null }>) {
      const emailHandle = p.email ? p.email.split("@")[0] : null;
      profileMap[p.uid] = p.display_name ?? p.first_name ?? emailHandle ?? "Member";
    }

    const memberCompletions: Record<string, { userId: string; name: string; completed: number }> = {};
    for (const m of rawMembers) {
      memberCompletions[m.user_id] = {
        userId: m.user_id,
        name: profileMap[m.user_id] ?? "Member",
        completed: 0,
      };
    }
    for (const t of tasks) {
      if (t.status !== "Completed") continue;
      if (t.auto_completed_reason) continue; // automation-completed
      const uid = t.completed_by;
      if (uid && memberCompletions[uid]) {
        memberCompletions[uid].completed++;
      }
    }

    // Completion streak — consecutive days from weekStart through today with ≥1 completed task
    const completedDates = new Set(
      tasks
        .filter((t) => t.status === "Completed")
        .map((t) => t.due_date.slice(0, 10)),
    );
    let streak = 0;
    const startDay = new Date(weekStart);
    const todayDay = new Date(today);
    const checkDay = new Date(startDay);
    while (checkDay <= todayDay) {
      const ds = checkDay.toISOString().slice(0, 10);
      if (completedDates.has(ds)) {
        streak++;
      } else {
        streak = 0; // reset on any gap
      }
      checkDay.setUTCDate(checkDay.getUTCDate() + 1);
    }

    // ── Harvest aggregation ─────────────────────────────────────────────────
    const harvestTasks = tasks.filter((t) =>
      ["Harvesting", "Harvest"].includes(t.type ?? ""),
    );
    const harvestBlueprintsDue = new Set(
      harvestTasks.map((t) => t.id), // deduplicate by task id (blueprints may generate multiple)
    ).size;
    const harvestBlueprintsCompleted = harvestTasks.filter(
      (t) => t.status === "Completed",
    ).length;

    const yieldRecords = yieldResult.data ?? [];
    const harvestInstanceIds = new Set(
      yieldRecords.map((y) => y.instance_id).filter(Boolean),
    );
    const totalYieldByUnit: Record<string, number> = {};
    for (const y of yieldRecords) {
      if (!y.unit) continue;
      totalYieldByUnit[y.unit] = (totalYieldByUnit[y.unit] ?? 0) + (y.value ?? 0);
    }

    // ── Pruning aggregation ─────────────────────────────────────────────────
    const pruningTasks = tasks.filter((t) => t.type === "Pruning");
    const pruningBlueprintsDue = new Set(pruningTasks.map((t) => t.id)).size;
    const pruningBlueprintsCompleted = pruningTasks.filter(
      (t) => t.status === "Completed",
    ).length;

    const pruningRecords = pruningResult.data ?? [];
    const prunedInstanceIds = new Set(
      pruningRecords.map((r) => r.instance_id).filter(Boolean),
    );
    const generalPruningEvents = pruningRecords.filter(
      (r) => r.instance_id === null,
    ).length;

    // ── Inventory aggregation ───────────────────────────────────────────────
    const inventory = inventoryResult.data ?? [];
    const totalPlants = inventory.length;
    const plantsAddedThisWeek = inventory.filter(
      (i) => i.created_at >= weekStart && i.created_at <= weekEnd,
    ).length;

    // ── Weather aggregation ─────────────────────────────────────────────────
    const [alertsResult, snapshotResult] = weatherResult;
    const weatherAlerts = alertsResult.data ?? [];
    const snapshot = snapshotResult.data;

    let rainfallMm: number | null = null;
    if (snapshot?.data?.daily?.precipitation_sum && snapshot.data.daily.time) {
      const times: string[] = snapshot.data.daily.time;
      const precip: number[] = snapshot.data.daily.precipitation_sum;
      const weekStartDate = weekStart.slice(0, 10);
      const todayDate = today;
      let total = 0;
      for (let i = 0; i < times.length; i++) {
        const d = times[i];
        if (d >= weekStartDate && d <= todayDate) {
          total += precip[i] ?? 0;
        }
      }
      rainfallMm = Math.round(total * 10) / 10;
    }

    // ── Automation aggregation ──────────────────────────────────────────────
    const runs = automationRunsResult.data ?? [];
    const automationTotal = runs.length;
    const automationSuccessful = runs.filter((r) =>
      ["success", "partial"].includes(r.status),
    ).length;
    const automationFailed = runs.filter((r) => r.status === "failed").length;
    const automationTasksCompleted = runs
      .filter((r) => ["success", "partial"].includes(r.status))
      .reduce((sum, r) => {
        const arr = r.tasks_completed;
        return sum + (Array.isArray(arr) ? arr.length : 0);
      }, 0);

    // ── Day-by-day upcoming strip ───────────────────────────────────────────
    const dayStrip: Array<{
      date: string;
      total: number;
      completed: number;
      isPast: boolean;
      isToday: boolean;
    }> = [];
    const stripDay = new Date(weekStart);
    const stripEnd = new Date(weekEnd);
    while (stripDay <= stripEnd) {
      const ds = stripDay.toISOString().slice(0, 10);
      const dayTasks = tasks.filter((t) => t.due_date.slice(0, 10) === ds);
      dayStrip.push({
        date: ds,
        total: dayTasks.length,
        completed: dayTasks.filter((t) => t.status === "Completed").length,
        isPast: ds < today,
        isToday: ds === today,
      });
      stripDay.setUTCDate(stripDay.getUTCDate() + 1);
    }

    const result = {
      tasks: {
        total: taskTotal,
        completed: taskCompleted,
        autoCompleted: taskAutoCompleted,
        overdue: taskOverdue,
        pending: taskPending,
        completionRate,
        byCategory: taskByCategory,
        skippedByRain: taskSkippedByRain,
        streak,
        memberBreakdown: Object.values(memberCompletions),
      },
      garden: {
        totalPlants,
        plantsAddedThisWeek,
        harvestBlueprintsDue,
        harvestBlueprintsCompleted,
        plantInstancesHarvested: harvestInstanceIds.size,
        totalYieldByUnit,
        pruningBlueprintsDue,
        pruningBlueprintsCompleted,
        plantInstancesPruned: prunedInstanceIds.size,
        generalPruningEvents,
      },
      weather: {
        alertCount: weatherAlerts.length,
        activeAlertCount: weatherAlerts.filter((a) => a.is_active).length,
        rainfallMm,
        tasksSkippedByRain: taskSkippedByRain,
      },
      automations: {
        total: automationTotal,
        successful: automationSuccessful,
        failed: automationFailed,
        tasksCompleted: automationTasksCompleted,
      },
      additional: {
        plantDoctorSessions: (doctorResult.data ?? []).length,
        newWatchlistAlerts: (ailmentsResult.data ?? []).length,
      },
      dayStrip,
    };

    log(FN, "done", { homeId });
    return json(result);
  } catch (err) {
    console.error(`[${FN}] unhandled error`, err);
    return json({ error: "internal_error" }, 500);
  }
});
