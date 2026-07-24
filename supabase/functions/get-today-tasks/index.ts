// get-today-tasks — returns a home's actionable tasks for a given day (default
// today), resolved the same way the app's list is, for thin clients (the Wear
// companion) that shouldn't re-implement the browser ghost engine.
//
// Composition (see _shared/todayTasks.ts + docs/wear-os-companion-plan.md §6):
//   • Persisted `tasks` (Pending, due <= day) — covers standalone tasks AND the
//     frequency recurring tasks the `generate-tasks` cron materialises.
//   • Seasonal WINDOW ghosts (Harvesting/Harvest/Pruning) — the only ghost-only
//     type, projected here via `projectAnnualWindows`, suppressed when the home
//     already has a task row for that blueprint+window (acted-on/completed).
//
// Auth: requireAuth (JWT) + requireHomeMembership. Read-only; no writes.

import { serviceClient } from "../_shared/supabaseClient.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import { captureException } from "../_shared/sentry.ts";
import {
  resolveDayTasks,
  SEASONAL_WINDOW_TYPES,
  type FreqBlueprintRow,
  type PersistedTaskRow,
  type WindowBlueprintRow,
} from "../_shared/todayTasks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = serviceClient();
    // serviceClient() is a newer supabase-js than the auth helpers import; cast
    // for them (same pattern as generate-daily-brief). Queries use `db`.
    const authDb = db as unknown as Parameters<typeof requireAuth>[1];

    const auth = await requireAuth(req, authDb);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;

    const body = await req.json().catch(() => ({}));
    const homeId: string | undefined = body.home_id;
    if (!homeId || typeof homeId !== "string") {
      return new Response(JSON.stringify({ error: "home_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const membershipErr = await requireHomeMembership(authDb, homeId, userId);
    if (membershipErr) return membershipErr;

    // The service client bypasses RLS, so we must replicate the tasks_select /
    // task_blueprints scope rule (20260509100000) ourselves — otherwise another
    // member's PERSONAL tasks/blueprints would leak. This is a strict SUBSET of
    // the RLS policy (home rows + the caller's own personal rows); it never
    // over-shows, so it can't leak. It intentionally does NOT surface other
    // members' personal rows to owners/admins (a safe under-show, and the right
    // call for a watch — you don't want teammates' private tasks on your wrist).
    const scopeFilter = `scope.eq.home,created_by.eq.${userId},assigned_to.eq.${userId}`;

    // Dates: `date` = the day being viewed; `today` = the caller's actual local
    // today (used for the overdue carry). Both default to the server's UTC today.
    const isoDate = (v: unknown, fallback: string): string =>
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : fallback;
    const serverToday = new Date().toISOString().slice(0, 10);
    const today = isoDate(body.today, serverToday);
    const date = isoDate(body.date, today);
    const isToday = date === today;

    const TASK_COLS = "id, blueprint_id, title, type, due_date, status, window_end_date";

    // 1. The day's tasks — ALL statuses (so the watch can show To-do + Done).
    const { data: dayRaw, error: dErr } = await db
      .from("tasks")
      .select(TASK_COLS)
      .eq("home_id", homeId)
      .eq("due_date", date)
      .or(scopeFilter);
    if (dErr) throw dErr;
    const dayTasks = (dayRaw ?? []) as PersistedTaskRow[];

    // 2. Overdue carry — pending tasks due before today (only when viewing today).
    let overdueTasks: PersistedTaskRow[] = [];
    if (isToday) {
      const { data: odRaw, error: odErr } = await db
        .from("tasks")
        .select(TASK_COLS)
        .eq("home_id", homeId)
        .eq("status", "Pending")
        .lt("due_date", today)
        .or(scopeFilter);
      if (odErr) throw odErr;
      overdueTasks = (odRaw ?? []) as PersistedTaskRow[];
    }

    // 3. Active seasonal-window blueprints (the ghost-only type).
    const { data: bpRaw, error: bpErr } = await db
      .from("task_blueprints")
      .select("id, title, task_type, start_date, end_date, recurrence_kind, recurs_until")
      .eq("home_id", homeId)
      .eq("is_archived", false)
      .in("task_type", [...SEASONAL_WINDOW_TYPES])
      .not("end_date", "is", null)
      .or(scopeFilter);
    if (bpErr) throw bpErr;
    const windowBlueprints = (bpRaw ?? []) as WindowBlueprintRow[];

    // 3b. Active FREQUENCY recurring blueprints — projected here only for
    //     today+future days the `generate-tasks` cron hasn't reached yet.
    let freqBlueprints: FreqBlueprintRow[] = [];
    if (date >= today) {
      const { data: fbRaw, error: fbErr } = await db
        .from("task_blueprints")
        .select(
          "id, title, task_type, start_date, end_date, frequency_days, paused_until, recurrence_kind, recurs_until",
        )
        .eq("home_id", homeId)
        .eq("is_recurring", true)
        .eq("is_archived", false)
        .gt("frequency_days", 0)
        .or(scopeFilter);
      if (fbErr) throw fbErr;
      freqBlueprints = (fbRaw ?? []) as FreqBlueprintRow[];
    }

    // 4. Suppression set — a task already logged for a blueprint on the relevant
    //    day means we must NOT re-show it as a ghost:
    //      • window ghosts key on the window START (may be months before `date`),
    //        so pull ALL of the window blueprints' task rows (few — ~1/season);
    //      • frequency ghosts key on `date` itself, so a targeted due_date == date
    //        lookup for the frequency blueprints is enough (and stays tiny).
    const suppressed = new Set<string>();
    if (windowBlueprints.length > 0) {
      const { data: existing } = await db
        .from("tasks")
        .select("blueprint_id, due_date")
        .eq("home_id", homeId)
        .in("blueprint_id", windowBlueprints.map((b) => b.id));
      for (const t of existing ?? []) {
        if (t.blueprint_id) {
          suppressed.add(`${t.blueprint_id}|${String(t.due_date).slice(0, 10)}`);
        }
      }
    }
    if (freqBlueprints.length > 0) {
      const { data: existingFreq } = await db
        .from("tasks")
        .select("blueprint_id, due_date")
        .eq("home_id", homeId)
        .eq("due_date", date)
        .in("blueprint_id", freqBlueprints.map((b) => b.id));
      for (const t of existingFreq ?? []) {
        if (t.blueprint_id) {
          suppressed.add(`${t.blueprint_id}|${String(t.due_date).slice(0, 10)}`);
        }
      }
    }

    const tasks = resolveDayTasks({
      date,
      today,
      dayTasks,
      overdueTasks,
      windowBlueprints,
      freqBlueprints,
      suppressed,
    });

    return new Response(JSON.stringify({ tasks, home_id: homeId, date, today }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[get-today-tasks]", error.message);
    await captureException("get-today-tasks", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
