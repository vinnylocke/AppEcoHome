import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "garden-reports";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://rhozly.com";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function prevMonthWindow(): { start: Date; end: Date; year: number; month: number } {
  const now = new Date();
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
    year,
    month,
  };
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Data types ───────────────────────────────────────────────────────────────

interface TaskCounts {
  Planting: number;
  Watering: number;
  Harvesting: number;
  Maintenance: number;
  Pruning: number;
}

interface MonthStats {
  tasksCompleted: number;
  tasksByType: TaskCounts;
  newPlants: number;
  pruned: number;
  harvested: number;
  weatherEvents: number;
}

const EMPTY_STATS: MonthStats = {
  tasksCompleted: 0,
  tasksByType: { Planting: 0, Watering: 0, Harvesting: 0, Maintenance: 0, Pruning: 0 },
  newPlants: 0,
  pruned: 0,
  harvested: 0,
  weatherEvents: 0,
};

// ─── Supabase queries ─────────────────────────────────────────────────────────

async function fetchLocationIds(supabase: any, homeId: string): Promise<string[]> {
  const { data } = await supabase.from("locations").select("id").eq("home_id", homeId);
  return (data ?? []).map((l: any) => l.id);
}

async function fetchMonthStats(
  supabase: any,
  homeId: string,
  locationIds: string[],
  start: Date,
  end: Date,
): Promise<MonthStats> {
  const startStr = start.toISOString();
  const endStr = end.toISOString();

  const [tasksRes, plantsRes, harvestsRes, weatherRes] = await Promise.all([
    supabase.from("tasks").select("type").eq("home_id", homeId).eq("status", "Completed")
      .gte("completed_at", startStr).lt("completed_at", endStr),
    supabase.from("inventory_items").select("id", { count: "exact", head: true })
      .eq("home_id", homeId).gte("created_at", startStr).lt("created_at", endStr),
    supabase.from("yield_records").select("id", { count: "exact", head: true })
      .eq("home_id", homeId).gte("harvested_at", startStr).lt("harvested_at", endStr),
    locationIds.length > 0
      ? supabase.from("weather_alerts").select("id", { count: "exact", head: true })
          .in("location_id", locationIds).gte("created_at", startStr).lt("created_at", endStr)
      : Promise.resolve({ count: 0 }),
  ]);

  const tasksByType: TaskCounts = { Planting: 0, Watering: 0, Harvesting: 0, Maintenance: 0, Pruning: 0 };
  let tasksCompleted = 0;
  for (const t of tasksRes.data ?? []) {
    tasksCompleted++;
    if (t.type in tasksByType) tasksByType[t.type as keyof TaskCounts]++;
  }

  return {
    tasksCompleted,
    tasksByType,
    newPlants: plantsRes.count ?? 0,
    pruned: tasksByType.Pruning,
    harvested: harvestsRes.count ?? 0,
    weatherEvents: (weatherRes as any).count ?? 0,
  };
}

async function fetchYearStats(
  supabase: any,
  homeId: string,
  locationIds: string[],
  year: number,
): Promise<Array<{ monthName: string } & MonthStats>> {
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const [tasksRes, plantsRes, harvestsRes, weatherRes] = await Promise.all([
    supabase.from("tasks").select("type, completed_at").eq("home_id", homeId)
      .eq("status", "Completed").gte("completed_at", yearStart).lt("completed_at", yearEnd),
    supabase.from("inventory_items").select("created_at").eq("home_id", homeId)
      .gte("created_at", yearStart).lt("created_at", yearEnd),
    supabase.from("yield_records").select("harvested_at").eq("home_id", homeId)
      .gte("harvested_at", yearStart).lt("harvested_at", yearEnd),
    locationIds.length > 0
      ? supabase.from("weather_alerts").select("created_at").in("location_id", locationIds)
          .gte("created_at", yearStart).lt("created_at", yearEnd)
      : Promise.resolve({ data: [] }),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => ({
    monthName: MONTH_NAMES[i],
    ...structuredClone(EMPTY_STATS),
    tasksByType: { Planting: 0, Watering: 0, Harvesting: 0, Maintenance: 0, Pruning: 0 },
  }));

  for (const t of tasksRes.data ?? []) {
    const m = new Date(t.completed_at).getUTCMonth();
    months[m].tasksCompleted++;
    if (t.type in months[m].tasksByType) months[m].tasksByType[t.type as keyof TaskCounts]++;
    if (t.type === "Pruning") months[m].pruned++;
  }
  for (const p of plantsRes.data ?? []) {
    months[new Date(p.created_at).getUTCMonth()].newPlants++;
  }
  // Harvests from yield_records (authoritative)
  for (const h of harvestsRes.data ?? []) {
    months[new Date(h.harvested_at).getUTCMonth()].harvested++;
  }
  for (const w of (weatherRes as any).data ?? []) {
    months[new Date(w.created_at).getUTCMonth()].weatherEvents++;
  }

  return months;
}

// ─── Email builders ───────────────────────────────────────────────────────────

function deltaLabel(n: number): string {
  if (n === 0) return "";
  return n > 0 ? `+${n}` : `${n}`;
}

function deltaColor(n: number): string {
  if (n > 0) return "#16a34a";
  if (n < 0) return "#dc2626";
  return "#9aada3";
}

function barGraph(value: number, max: number): string {
  if (max === 0) return "";
  const pct = Math.round((value / max) * 100);
  const filled = Math.round(pct / 5);
  return "▓".repeat(filled) + "░".repeat(20 - filled) + ` ${pct}%`;
}

function buildMonthlyEmail(
  name: string,
  homeName: string,
  monthLabel: string,
  current: MonthStats,
  previous: MonthStats,
): string {
  const delta = {
    tasks: current.tasksCompleted - previous.tasksCompleted,
    plants: current.newPlants - previous.newPlants,
    pruned: current.pruned - previous.pruned,
    harvested: current.harvested - previous.harvested,
    weather: current.weatherEvents - previous.weatherEvents,
  };

  const maxType = Math.max(...Object.values(current.tasksByType), 1);
  const typeRows = Object.entries(current.tasksByType)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `
      <tr>
        <td style="padding:5px 0;font-size:12px;color:#4a6355;font-weight:600;min-width:90px;">${type}</td>
        <td style="padding:5px 0;font-size:11px;color:#9aada3;font-family:monospace;">${barGraph(count, maxType)}</td>
        <td style="padding:5px 0 5px 8px;font-size:12px;color:#0f2a1e;font-weight:700;">${count}</td>
      </tr>`)
    .join("");

  const typeSection = current.tasksCompleted > 0 ? `
    <div style="margin:0 0 28px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Task Breakdown</p>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">${typeRows}</table>
    </div>` : "";

  const statCard = (icon: string, label: string, value: number, d: number) => `
    <td style="padding:12px;text-align:center;background:#fafafa;border-radius:10px;width:50%;">
      <div style="font-size:22px;line-height:1;">${icon}</div>
      <div style="font-size:22px;font-weight:800;color:#0f2a1e;margin:4px 0;">${value}</div>
      <div style="font-size:11px;color:#9aada3;font-weight:600;">${label}</div>
      ${d !== 0 ? `<div style="font-size:11px;font-weight:700;color:${deltaColor(d)};margin-top:2px;">${deltaLabel(d)} vs last month</div>` : ""}
    </td>`;

  const isEmpty = current.tasksCompleted === 0 && current.newPlants === 0 && current.harvested === 0;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f0f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px 40px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(7,87,55,0.08);">

      <div style="background-color:#075737;padding:28px 40px;text-align:center;">
        <p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Rhozly</p>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;">${monthLabel} Garden Report</p>
      </div>

      <div style="padding:36px 40px;">
        <p style="margin:0 0 28px;font-size:15px;color:#4a6355;line-height:1.6;">Hi ${name}, here's how <strong>${homeName}</strong> got on in ${monthLabel}.</p>

        ${isEmpty
          ? `<p style="margin:0 0 28px;font-size:14px;color:#9aada3;text-align:center;padding:24px;background:#fafafa;border-radius:10px;">No activity recorded for ${monthLabel}. Start tracking tasks and plants to see your report here.</p>`
          : `<table cellpadding="0" cellspacing="8" border="0" style="width:100%;margin:0 0 28px;">
              <tr>
                ${statCard("✅", "Tasks Completed", current.tasksCompleted, delta.tasks)}
                ${statCard("🌱", "New Plants", current.newPlants, delta.plants)}
              </tr>
              <tr>
                ${statCard("✂️", "Pruned", current.pruned, delta.pruned)}
                ${statCard("🍅", "Harvested", current.harvested, delta.harvested)}
              </tr>
              <tr>
                ${statCard("⛅", "Weather Events", current.weatherEvents, delta.weather)}
                <td style="padding:12px;width:50%;"></td>
              </tr>
            </table>
            ${typeSection}`
        }

        <a href="${SITE_URL}" style="display:block;background-color:#075737;color:#ffffff;text-decoration:none;text-align:center;padding:15px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.01em;">Open Rhozly →</a>
      </div>

      <div style="padding:20px 40px;border-top:1px solid #e8f0eb;">
        <p style="margin:0;font-size:12px;color:#9aada3;line-height:1.6;">You're receiving this monthly garden report as a member of <strong>${homeName}</strong> on Rhozly.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildYearlyEmail(
  name: string,
  homeName: string,
  year: number,
  byMonth: Array<{ monthName: string } & MonthStats>,
): string {
  const totals = byMonth.reduce(
    (acc, m) => ({
      tasksCompleted: acc.tasksCompleted + m.tasksCompleted,
      newPlants: acc.newPlants + m.newPlants,
      pruned: acc.pruned + m.pruned,
      harvested: acc.harvested + m.harvested,
      weatherEvents: acc.weatherEvents + m.weatherEvents,
    }),
    { tasksCompleted: 0, newPlants: 0, pruned: 0, harvested: 0, weatherEvents: 0 },
  );

  const isEmpty = totals.tasksCompleted === 0 && totals.newPlants === 0 && totals.harvested === 0;

  if (isEmpty) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f0;font-family:-apple-system,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px 40px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(7,87,55,0.08);">
      <div style="background:#075737;padding:28px 40px;text-align:center;">
        <p style="margin:0;color:#fff;font-size:22px;font-weight:800;">Rhozly</p>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">${year} Year in Review</p>
      </div>
      <div style="padding:36px 40px;">
        <p style="font-size:15px;color:#4a6355;line-height:1.6;">Hi ${name}, no garden activity was recorded for <strong>${homeName}</strong> in ${year}. Start the new year by logging your first task!</p>
        <a href="${SITE_URL}" style="display:block;background:#075737;color:#fff;text-decoration:none;text-align:center;padding:15px 32px;border-radius:10px;font-size:15px;font-weight:700;">Open Rhozly →</a>
      </div>
    </div>
  </div>
</body></html>`;
  }

  // Busiest month
  const busiest = byMonth.reduce((a, b) => a.tasksCompleted >= b.tasksCompleted ? a : b);
  // Top task type (from year totals)
  const typeTotals = byMonth.reduce((acc, m) => {
    for (const [k, v] of Object.entries(m.tasksByType)) {
      acc[k] = (acc[k] ?? 0) + (v as number);
    }
    return acc;
  }, {} as Record<string, number>);
  const topType = Object.entries(typeTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];

  // Month activity bars
  const maxMonthTasks = Math.max(...byMonth.map(m => m.tasksCompleted), 1);
  const monthBars = byMonth
    .map(m => {
      const barLen = Math.round((m.tasksCompleted / maxMonthTasks) * 16);
      const bar = "▓".repeat(barLen) + "░".repeat(16 - barLen);
      return `<tr>
        <td style="padding:4px 0;font-size:11px;color:#4a6355;font-weight:600;min-width:36px;">${m.monthName.slice(0, 3)}</td>
        <td style="padding:4px 8px;font-size:11px;color:#9aada3;font-family:monospace;">${bar}</td>
        <td style="padding:4px 0;font-size:11px;color:#0f2a1e;font-weight:700;">${m.tasksCompleted}</td>
      </tr>`;
    })
    .join("");

  const highlights: string[] = [];
  if (busiest.tasksCompleted > 0) highlights.push(`🏆 Busiest month: ${busiest.monthName} (${busiest.tasksCompleted} tasks)`);
  if (topType) highlights.push(`⭐ Favourite task: ${topType[0]} (${topType[1]} times)`);
  if (totals.newPlants > 0) highlights.push(`🌱 ${totals.newPlants} new plant${totals.newPlants !== 1 ? "s" : ""} added`);
  if (totals.harvested > 0) highlights.push(`🍅 ${totals.harvested} harvest${totals.harvested !== 1 ? "s" : ""} recorded`);
  if (totals.weatherEvents > 0) highlights.push(`⛅ ${totals.weatherEvents} weather event${totals.weatherEvents !== 1 ? "s" : ""} logged`);

  const highlightHtml = highlights.map(h =>
    `<div style="padding:10px 14px;border-radius:8px;background:#f0f9f4;border-left:3px solid #075737;margin-bottom:8px;font-size:13px;color:#0f2a1e;font-weight:600;">${h}</div>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f0f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px 40px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(7,87,55,0.08);">

      <div style="background-color:#075737;padding:28px 40px;text-align:center;">
        <p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Rhozly</p>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;">${year} — Your Year in Review</p>
      </div>

      <div style="padding:36px 40px;">
        <p style="margin:0 0 28px;font-size:15px;color:#4a6355;line-height:1.6;">Hi ${name}, what a year for <strong>${homeName}</strong>! Here's how ${year} looked.</p>

        <!-- Totals grid -->
        <div style="margin:0 0 28px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Year Totals</p>
          <table cellpadding="0" cellspacing="8" border="0" style="width:100%;">
            <tr>
              <td style="padding:12px;text-align:center;background:#fafafa;border-radius:10px;width:33%;">
                <div style="font-size:20px;font-weight:800;color:#0f2a1e;">${totals.tasksCompleted}</div>
                <div style="font-size:11px;color:#9aada3;font-weight:600;">✅ Tasks</div>
              </td>
              <td style="padding:12px;text-align:center;background:#fafafa;border-radius:10px;width:33%;">
                <div style="font-size:20px;font-weight:800;color:#0f2a1e;">${totals.newPlants}</div>
                <div style="font-size:11px;color:#9aada3;font-weight:600;">🌱 Plants</div>
              </td>
              <td style="padding:12px;text-align:center;background:#fafafa;border-radius:10px;width:33%;">
                <div style="font-size:20px;font-weight:800;color:#0f2a1e;">${totals.harvested}</div>
                <div style="font-size:11px;color:#9aada3;font-weight:600;">🍅 Harvests</div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Highlights -->
        <div style="margin:0 0 28px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Highlights</p>
          ${highlightHtml}
        </div>

        <!-- Monthly activity -->
        <div style="margin:0 0 28px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Monthly Activity</p>
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fafafa;border-radius:10px;padding:12px;">
            ${monthBars}
          </table>
        </div>

        <a href="${SITE_URL}" style="display:block;background-color:#075737;color:#ffffff;text-decoration:none;text-align:center;padding:15px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.01em;">Open Rhozly →</a>
      </div>

      <div style="padding:20px 40px;border-top:1px solid #e8f0eb;">
        <p style="margin:0;font-size:12px;color:#9aada3;line-height:1.6;">Your ${year} Year in Review from Rhozly — sent to members of <strong>${homeName}</strong>.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { start: monthStart, end: monthEnd, year: reportYear, month: reportMonth } = prevMonthWindow();
    const monthLabel = `${MONTH_NAMES[reportMonth]} ${reportYear}`;
    const isJanuary = new Date().getUTCMonth() === 0; // running Jan 1st = send yearly for prev year
    const prevYear = reportYear; // prevMonthWindow already points to the previous year when in January

    console.log(`📊 Garden reports — ${monthLabel}${isJanuary ? " + Year in Review " + prevYear : ""}`);

    const { data: homes } = await supabase.from("homes").select("id, name");
    if (!homes || homes.length === 0) {
      return new Response(JSON.stringify({ message: "No homes." }), { status: 200 });
    }

    let totalSent = 0;

    for (const home of homes) {
      try {
        const { data: memberRows } = await supabase
          .from("home_members").select("user_id").eq("home_id", home.id);
        if (!memberRows || memberRows.length === 0) continue;

        const { data: profiles } = await supabase
          .from("user_profiles").select("uid, email, display_name")
          .in("uid", memberRows.map((m: any) => m.user_id));

        const members = (profiles ?? []).filter((p: any) => p.email);
        if (members.length === 0) continue;

        const locationIds = await fetchLocationIds(supabase, home.id);

        // Monthly stats (current and previous month for delta)
        const prevMonthStart = new Date(Date.UTC(
          reportMonth === 0 ? reportYear - 1 : reportYear,
          reportMonth === 0 ? 11 : reportMonth - 1,
          1,
        ));
        const [current, previous] = await Promise.all([
          fetchMonthStats(supabase, home.id, locationIds, monthStart, monthEnd),
          fetchMonthStats(supabase, home.id, locationIds, prevMonthStart, monthStart),
        ]);

        // Yearly stats (only on January)
        const yearByMonth = isJanuary
          ? await fetchYearStats(supabase, home.id, locationIds, prevYear)
          : null;

        for (const member of members) {
          const displayName = member.display_name ?? member.email.split("@")[0];

          // Monthly report
          try {
            await sendEmail({
              from: "Rhozly <info@rhozly.com>",
              to: member.email,
              subject: `🌿 Your ${monthLabel} Garden Report`,
              html: buildMonthlyEmail(displayName, home.name, monthLabel, current, previous),
            });
            totalSent++;
            console.log(`✅ Monthly report sent to ${member.email} for ${home.name}`);
          } catch (err: any) {
            console.error(`❌ Monthly email failed for ${member.email}:`, err.message);
          }

          // Yearly report (January only)
          if (isJanuary && yearByMonth) {
            try {
              await sendEmail({
                from: "Rhozly <info@rhozly.com>",
                to: member.email,
                subject: `🎉 Your ${prevYear} Year in Review — Rhozly`,
                html: buildYearlyEmail(displayName, home.name, prevYear, yearByMonth),
              });
              totalSent++;
              console.log(`✅ Yearly report sent to ${member.email} for ${home.name}`);
            } catch (err: any) {
              console.error(`❌ Yearly email failed for ${member.email}:`, err.message);
            }
          }
        }
      } catch (err: any) {
        console.error(`❌ Error processing home ${home.id}:`, err.message);
      }
    }

    return new Response(JSON.stringify({ success: true, sent: totalSent }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("🔥 Fatal:", err.message);
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
