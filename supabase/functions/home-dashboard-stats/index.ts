import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";
import { log } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import {
  computeDayStrip,
  computeHarvestCounts,
  computeTaskStats,
  type StatTask,
} from "../_shared/dashboardStats.ts";

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

    const { homeId, weekStart, weekEnd, today, tzOffsetMinutes } = await req.json();
    if (!homeId || !weekStart || !weekEnd || !today) {
      return json({ error: "homeId, weekStart, weekEnd, today required" }, 400);
    }
    // Client's Date.getTimezoneOffset() — used to bucket UTC completed_at
    // timestamps onto the client's LOCAL calendar days. Optional: older
    // clients that don't send it keep the previous UTC behaviour.
    const tzOffset = Number(tzOffsetMinutes) || 0;
    // Inclusive end-of-week bound for timestamptz columns. A bare date
    // string coerces to Saturday 00:00, silently dropping everything
    // logged ON Saturday from the weekly counts.
    const weekEndTs = `${weekEnd}T23:59:59.999Z`;

    // Verify membership
    const { data: membership } = await db
      .from("home_members")
      .select("role")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return json({ error: "not_a_member" }, 403);

    log(FN, "start", { homeId, weekStart, weekEnd, today });

    const TASK_COLS =
      "id, status, type, due_date, completed_by, auto_completed_reason, completed_at, window_end_date, next_check_at, inventory_item_ids, blueprint_id";

    // ── Run all queries in parallel ─────────────────────────────────────────
    const [
      openTasksResult,
      doneTasksResult,
      membersResult,
      automationRunsResult,
      yieldResult,
      pruningResult,
      inventoryResult,
      weatherResult,
      doctorResult,
      ailmentsResult,
    ] = await Promise.all([
      // 1a. OPEN tasks — widened for RHO-14/15/16 so overdue carried in
      //     from before this week and pre-week harvest windows are caught.
      //     Restricted to Pending so the set stays bounded: the previous
      //     single `due_date <= weekEnd` query matched every historical
      //     Completed/Skipped row the home ever had, and PostgREST's
      //     max_rows=1000 silently truncated it — every count quietly
      //     degraded once a home passed 1,000 task rows.
      db
        .from("tasks")
        .select(TASK_COLS)
        .eq("home_id", homeId)
        .eq("status", "Pending")
        .or(`due_date.lte.${weekEnd},window_end_date.gte.${weekStart}`),

      // 1b. RESOLVED tasks (Completed/Skipped) — bounded to this week's
      //     activity: due (or window) inside the week, or completed within
      //     the week (any due date, for the completedThisWeek stat).
      db
        .from("tasks")
        .select(TASK_COLS)
        .eq("home_id", homeId)
        .neq("status", "Pending")
        .or(
          `and(due_date.gte.${weekStart},due_date.lte.${weekEnd}),and(due_date.lte.${weekEnd},window_end_date.gte.${weekStart}),completed_at.gte.${weekStart}`,
        ),

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
        .lte("triggered_at", weekEndTs),

      // 4. Yield records this week
      db
        .from("yield_records")
        .select("id, instance_id, value, unit")
        .eq("home_id", homeId)
        .gte("harvested_at", weekStart)
        .lte("harvested_at", weekEndTs),

      // 5. Pruning records this week
      db
        .from("pruning_records")
        .select("id, instance_id")
        .eq("home_id", homeId)
        .gte("pruned_at", weekStart)
        .lte("pruned_at", weekEndTs),

      // 6. Inventory items (active counts + new this week)
      db
        .from("inventory_items")
        .select("id, status, created_at")
        .eq("home_id", homeId)
        .in("status", ["In Shed", "Planted", "Germinating"]),

      // 7. Weather: alerts + snapshot for rainfall.
      // weather_alerts is LOCATION-scoped (no home_id column) — filtering on
      // home_id 400'd silently here since the RHO-14 rewrite, so the weekly
      // alert counts were always 0. Same phantom-column class as RHOZLY-3P.
      Promise.all([
        db
          .from("weather_alerts")
          .select("id, type, severity, is_active, starts_at, locations!inner(home_id)")
          .eq("locations.home_id", homeId)
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
        .lte("created_at", weekEndTs),

      // 9. New watchlist ailments this week
      db
        .from("ailments")
        .select("id")
        .eq("home_id", homeId)
        .eq("is_archived", false)
        .gte("created_at", weekStart)
        .lte("created_at", weekEndTs),
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
    // `tasks` is the WIDENED set (prior-week overdue + future harvest
    // windows included — see the queries above; open and resolved rows are
    // disjoint by status so a plain concat can't duplicate). Counts that
    // must stay "this week only" derive from `weekTasks` (effective span
    // intersects the ISO week); RHO-14/15/16 counts use the full set.
    const tasks = [
      ...((openTasksResult.data ?? []) as StatTask[]),
      ...((doneTasksResult.data ?? []) as StatTask[]),
    ];
    const weekTasks = tasks.filter((t) => {
      const eff = (t.next_check_at && t.due_date && t.next_check_at > t.due_date)
        ? t.next_check_at
        : t.due_date;
      if (eff == null) return false;
      if (t.window_end_date) return eff <= weekEnd && t.window_end_date >= weekStart;
      return eff >= weekStart && eff <= weekEnd;
    });

    // RHO-14: Total / Overdue / Pending. Total + Pending stay week-scoped;
    // Overdue is computed over the FULL widened set so overdue-from-any-
    // prior-week is reflected. `priorOverdue` + `completedThisWeek` are the
    // RHO-14 "additional count" (a small carried-over/activity stat).
    const taskStats = computeTaskStats(tasks, weekStart, weekEnd, today, tzOffset);
    const taskTotal = taskStats.total;
    const taskOverdue = taskStats.overdue;
    const taskPending = taskStats.pending;

    const taskCompleted = weekTasks.filter((t) => t.status === "Completed").length;
    const taskAutoCompleted = weekTasks.filter(
      (t) => t.status === "Completed" && t.auto_completed_reason,
    ).length;
    const taskSkippedByRain = weekTasks.filter(
      (t) =>
        t.status === "Skipped" &&
        t.auto_completed_reason?.toLowerCase().includes("rain"),
    ).length;
    const completionRate =
      taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0;

    // By category (week-scoped)
    const taskByCategory: Record<string, number> = {};
    for (const t of weekTasks.filter((t) => t.status !== "Skipped")) {
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
    for (const t of weekTasks) {
      if (t.status !== "Completed") continue;
      if (t.auto_completed_reason) continue; // automation-completed
      const uid = (t as { completed_by?: string | null }).completed_by;
      if (uid && memberCompletions[uid]) {
        memberCompletions[uid].completed++;
      }
    }

    // Completion streak — consecutive days from weekStart through today with ≥1 completed task
    const completedDates = new Set(
      weekTasks
        .filter((t) => t.status === "Completed" && t.due_date)
        .map((t) => t.due_date!.slice(0, 10)),
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

    // ── Harvest aggregation (RHO-16) ────────────────────────────────────────
    // "Harvests Due" = distinct plants + each unlinked harvest counts as 1,
    // for harvests whose window overlaps this ISO week. Completed harvests
    // are counted on the same subject-keyed basis. Runs over the full widened
    // set so pre-week-start windows are caught.
    const harvestCounts = computeHarvestCounts(tasks, weekStart, weekEnd);
    const harvestBlueprintsDue = harvestCounts.due;
    const harvestBlueprintsCompleted = harvestCounts.completed;

    const yieldRecords = yieldResult.data ?? [];
    const harvestInstanceIds = new Set(
      yieldRecords.map((y) => y.instance_id).filter(Boolean),
    );
    const totalYieldByUnit: Record<string, number> = {};
    for (const y of yieldRecords) {
      if (!y.unit) continue;
      totalYieldByUnit[y.unit] = (totalYieldByUnit[y.unit] ?? 0) + (y.value ?? 0);
    }

    // ── Pruning aggregation (week-scoped) ───────────────────────────────────
    const pruningTasks = weekTasks.filter((t) => t.type === "Pruning" && t.status !== "Skipped");
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
      (i) => i.created_at >= weekStart && i.created_at <= weekEndTs,
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

    // ── Day-by-day upcoming strip (RHO-15) ──────────────────────────────────
    // Prior-week overdue rolls onto the Sunday bucket; harvest-window tasks
    // count on every in-window day; each day shows overdue + pending.
    const dayStrip = computeDayStrip(tasks, weekStart, weekEnd, today, tzOffset);

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
        // RHO-14 "additional count" (interpretation flagged for on-device
        // verification): carried-over overdue from before this week +
        // tasks completed this week. Not folded into total/pending.
        priorOverdue: taskStats.priorOverdue,
        completedThisWeek: taskStats.completedThisWeek,
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
    await captureException(FN, err);
    return json({ error: "internal_error" }, 500);
  }
});
