import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { sendEmail } from "../_shared/resend.ts";

const FN = "weekly-digest";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://rhozly.com";

// ── Week window ──────────────────────────────────────────────────────────────

function getWeekWindow(): { monday: string; sunday: string } {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon…
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    monday: monday.toISOString().split("T")[0],
    sunday: sunday.toISOString().split("T")[0],
  };
}

// ── WMO code → emoji ─────────────────────────────────────────────────────────

function wmoEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 65) return "🌧️";
  if (code <= 67) return "🌨️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "❄️";
  return "⛈️";
}

// ── Day label ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return DAY_NAMES[d.getUTCDay()];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

// ── Severity badge colour ────────────────────────────────────────────────────

function severityColor(severity: string): string {
  if (severity === "critical") return "#dc2626";
  if (severity === "warning") return "#d97706";
  return "#2563eb";
}

function alertIcon(type: string): string {
  const icons: Record<string, string> = { frost: "🧊", rain: "🌧️", snow: "❄️", heat: "🌡️", wind: "💨" };
  return icons[type] ?? "⚠️";
}

// ── Email HTML ───────────────────────────────────────────────────────────────

interface DayForecast {
  date: string;
  emoji: string;
  maxC: number;
  minC: number;
}

interface Alert {
  type: string;
  severity: string;
  message: string;
}

interface Task {
  title: string;
  due_date: string;
}

function buildEmail(
  name: string,
  homeName: string,
  forecast: DayForecast[],
  alerts: Alert[],
  tasks: Task[],
  monday: string,
  sunday: string,
): string {
  const weatherRows = forecast
    .map(
      (d) =>
        `<td style="text-align:center;padding:8px 4px;min-width:64px;">
          <div style="font-size:22px;line-height:1;">${d.emoji}</div>
          <div style="font-size:11px;font-weight:700;color:#4a6355;margin-top:4px;">${dayLabel(d.date)}</div>
          <div style="font-size:12px;font-weight:800;color:#0f2a1e;">${Math.round(d.maxC)}°</div>
          <div style="font-size:11px;color:#8a9e94;">${Math.round(d.minC)}°</div>
        </td>`,
    )
    .join("\n");

  const alertSection =
    alerts.length > 0
      ? `<div style="margin:0 0 28px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Weather Alerts</p>
          ${alerts
            .map(
              (a) =>
                `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:8px;background:#fafafa;border-left:3px solid ${severityColor(a.severity)};margin-bottom:8px;">
                  <span style="font-size:16px;">${alertIcon(a.type)}</span>
                  <span style="font-size:13px;color:#4a6355;line-height:1.5;">${a.message}</span>
                </div>`,
            )
            .join("\n")}
        </div>`
      : "";

  const taskSection =
    tasks.length > 0
      ? `<div style="margin:0 0 28px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Tasks This Week</p>
          ${tasks
            .map(
              (t) =>
                `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;background:#fafafa;margin-bottom:6px;">
                  <span style="font-size:13px;color:#9aada3;font-weight:600;min-width:60px;">${formatDate(t.due_date.split("T")[0])}</span>
                  <span style="font-size:13px;color:#0f2a1e;font-weight:600;">${t.title}</span>
                </div>`,
            )
            .join("\n")}
        </div>`
      : `<div style="margin:0 0 28px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Tasks This Week</p>
          <p style="margin:0;font-size:13px;color:#9aada3;">All clear this week — no pending tasks.</p>
        </div>`;

  const weekRange = `${formatDate(monday)} – ${formatDate(sunday)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your week in the garden</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px 40px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(7,87,55,0.08);">

      <!-- Header -->
      <div style="background-color:#075737;padding:28px 40px;text-align:center;">
        <p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Rhozly</p>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;">Your Week in the Garden</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">

        <p style="margin:0 0 28px;font-size:15px;color:#4a6355;line-height:1.6;">Hi ${name}, here's what's coming up for your garden at <strong>${homeName}</strong> — ${weekRange}.</p>

        <!-- Weather grid -->
        ${
    forecast.length > 0
      ? `<div style="margin:0 0 28px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Weather This Week</p>
          <div style="overflow-x:auto;">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;background:#fafafa;border-radius:10px;overflow:hidden;">
              <tr>${weatherRows}</tr>
            </table>
          </div>
        </div>`
      : ""
  }

        ${alertSection}
        ${taskSection}

        <!-- CTA -->
        <a href="${SITE_URL}" style="display:block;background-color:#075737;color:#ffffff;text-decoration:none;text-align:center;padding:15px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.01em;">Open Rhozly →</a>

      </div>

      <!-- Footer -->
      <div style="padding:20px 40px;border-top:1px solid #e8f0eb;">
        <p style="margin:0;font-size:12px;color:#9aada3;line-height:1.6;">You're receiving this because you're a member of <strong>${homeName}</strong> on Rhozly. This digest is sent every Monday morning.</p>
      </div>

    </div>
  </div>
</body>
</html>`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { monday, sunday } = getWeekWindow();
    log(FN, "request_received", { monday, sunday });

    // 1. All homes
    const { data: homes, error: homesErr } = await supabase
      .from("homes")
      .select("id, name");
    if (homesErr) throw homesErr;
    if (!homes || homes.length === 0) {
      log(FN, "no_homes");
      return new Response(JSON.stringify({ message: "No homes." }), { status: 200 });
    }

    let totalSent = 0;
    let totalSkipped = 0;

    for (const home of homes) {
      try {
        // 2. Members with emails
        const { data: memberRows } = await supabase
          .from("home_members")
          .select("user_id")
          .eq("home_id", home.id);

        if (!memberRows || memberRows.length === 0) continue;
        const userIds = memberRows.map((m: any) => m.user_id);

        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("uid, email, display_name")
          .in("uid", userIds);

        const members = (profiles ?? []).filter((p: any) => p.email);
        if (members.length === 0) {
          warn(FN, "no_emails", { homeId: home.id });
          continue;
        }

        // 3. Weather forecast from snapshot
        const { data: snapshot } = await supabase
          .from("weather_snapshots")
          .select("data")
          .eq("home_id", home.id)
          .single();

        let forecast: DayForecast[] = [];
        if (snapshot?.data?.daily) {
          const raw = snapshot.data.daily;
          forecast = ((raw.time ?? []) as string[])
            .map((date: string, i: number) => ({
              date,
              emoji: wmoEmoji(raw.weathercode?.[i] ?? 0),
              maxC: raw.temperature_2m_max?.[i] ?? 0,
              minC: raw.temperature_2m_min?.[i] ?? 0,
            }))
            .filter((d: DayForecast) => d.date >= monday && d.date <= sunday);
        }

        // 4. Active weather alerts via home's locations
        const { data: locations } = await supabase
          .from("locations")
          .select("id")
          .eq("home_id", home.id);
        const locationIds = (locations ?? []).map((l: any) => l.id);

        let alerts: Alert[] = [];
        if (locationIds.length > 0) {
          const { data: alertRows } = await supabase
            .from("weather_alerts")
            .select("type, severity, message")
            .in("location_id", locationIds)
            .eq("is_active", true);
          // Deduplicate by type+message
          const seen = new Set<string>();
          for (const a of alertRows ?? []) {
            const key = `${a.type}:${a.message}`;
            if (!seen.has(key)) {
              seen.add(key);
              alerts.push(a);
            }
          }
        }

        // 5. Tasks due this week (physical only — no ghost tasks in DB)
        const { data: tasks } = await supabase
          .from("tasks")
          .select("title, due_date")
          .eq("home_id", home.id)
          .eq("status", "Pending")
          .gte("due_date", monday)
          .lte("due_date", sunday + "T23:59:59Z")
          .order("due_date", { ascending: true });

        log(FN, "home_data_ready", {
          homeId: home.id,
          members: members.length,
          forecastDays: forecast.length,
          alerts: alerts.length,
          tasks: tasks?.length ?? 0,
        });

        // 6. Send one email per member
        for (const member of members) {
          const displayName = member.display_name ?? member.email.split("@")[0];
          const html = buildEmail(
            displayName,
            home.name,
            forecast,
            alerts,
            tasks ?? [],
            monday,
            sunday,
          );
          try {
            await sendEmail({
              from: "Rhozly <info@rhozly.com>",
              to: member.email,
              subject: `🌿 Your week in the garden — ${formatDate(monday)}`,
              html,
            });
            totalSent++;
            log(FN, "email_sent", { homeId: home.id, to: member.email });
          } catch (err: any) {
            totalSkipped++;
            warn(FN, "email_failed", { homeId: home.id, to: member.email, error: err.message });
          }
        }
      } catch (err: any) {
        logError(FN, "home_error", { homeId: home.id, error: err.message });
      }
    }

    log(FN, "complete", { homes: homes.length, sent: totalSent, skipped: totalSkipped });
    return new Response(JSON.stringify({ success: true, sent: totalSent, skipped: totalSkipped }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "fatal", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
