// ─── weekly-optimise-digest ────────────────────────────────────────────────
//
// Runs every Sunday at 07:00 UTC (1h after generate-weekly-overviews so
// the two notifications don't land together). For each home that has at
// least one task blueprint, looks at the past week's task activity and
// surfaces a digest line — was the home busy, were tasks missed, are
// there any obvious schedule pile-ups. This is a lightweight digest,
// not a full optimisation run — full proposals stay on the Optimise tab.
//
// The user opens the Optimise tab from the notification deep link.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "weekly-optimise-digest";

function getPastWeekWindow(now: Date = new Date()): { start: string; end: string } {
  const end = new Date(now);
  end.setUTCDate(now.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { start, end } = getPastWeekWindow();
    log(FN, "start", { start, end });

    const [{ data: homes }, { data: homeMembers }] = await Promise.all([
      supabase.from("homes").select("id, name"),
      supabase.from("home_members").select("home_id, user_id"),
    ]);
    if (!homes || homes.length === 0) {
      return new Response(JSON.stringify({ message: "No homes." }), { status: 200 });
    }

    const membersByHome: Record<string, string[]> = {};
    for (const m of homeMembers ?? []) {
      if (!membersByHome[m.home_id]) membersByHome[m.home_id] = [];
      membersByHome[m.home_id].push(m.user_id);
    }

    let notificationsQueued = 0;

    for (const home of homes) {
      if (!membersByHome[home.id]?.length) continue;

      const [{ data: completed }, { data: skipped }, { data: overdue }, { data: bpCount }] = await Promise.all([
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("home_id", home.id)
          .eq("status", "Completed")
          .gte("due_date", start)
          .lte("due_date", end),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("home_id", home.id)
          .eq("status", "Skipped")
          .gte("due_date", start)
          .lte("due_date", end),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("home_id", home.id)
          .eq("status", "Pending")
          .lt("due_date", new Date().toISOString().split("T")[0]),
        supabase
          .from("task_blueprints")
          .select("id", { count: "exact", head: true })
          .eq("home_id", home.id)
          .eq("is_archived", false)
          .eq("is_recurring", true),
      ]);

      const cComp = (completed as any)?.count ?? 0;
      const cSkip = (skipped as any)?.count ?? 0;
      const cOver = (overdue as any)?.count ?? 0;
      const cBp = (bpCount as any)?.count ?? 0;

      // Headline + body picked from the activity profile.
      let title = "🪴 Weekly schedule digest";
      let body: string;
      if (cBp === 0) {
        // No blueprints → nothing for the Optimise tab to chew on.
        body = "No recurring schedules to review yet. Tap to see how task automations can save you time.";
      } else if (cOver >= 5) {
        title = "🪴 Lots of overdue — let's tidy";
        body = `${cOver} overdue task${cOver === 1 ? "" : "s"} carried into this week. Tap Optimise to suggest schedule changes that fit your real cadence.`;
      } else if (cSkip >= 3) {
        body = `You skipped ${cSkip} task${cSkip === 1 ? "" : "s"} this week. The Optimise tab can suggest frequency tweaks so the schedule matches what you actually do.`;
      } else if (cComp >= 10) {
        body = `Strong week — ${cComp} tasks completed. Tap to spot any schedule improvements the Optimise tab can suggest.`;
      } else {
        body = `Last week: ${cComp} done, ${cSkip} skipped, ${cOver} overdue. The Optimise tab will turn this into concrete schedule suggestions.`;
      }

      const notifications = membersByHome[home.id].map((user_id) => ({
        user_id,
        home_id: home.id,
        title,
        body,
        type: "weekly_optimise_digest",
        data: { route: "/schedule?tab=optimise" },
        is_read: false,
      }));
      const { error: notifErr } = await supabase
        .from("notifications")
        .insert(notifications);
      if (notifErr) {
        warn(FN, "notif_failed", { home_id: home.id, error: notifErr.message });
        continue;
      }
      notificationsQueued += notifications.length;
    }

    log(FN, "complete", { notificationsQueued });
    return new Response(
      JSON.stringify({ success: true, notificationsQueued }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    logError(FN, "unhandled", { error: err.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
