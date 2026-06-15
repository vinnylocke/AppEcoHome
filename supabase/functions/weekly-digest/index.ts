import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { sendEmail } from "../_shared/resend.ts";
import { captureException } from "../_shared/sentry.ts";
import { isTaskVisibleOnDate } from "../_shared/taskFilters.ts";
import {
  getDigestStyle,
  shouldNotify,
  type DigestStyle,
  type NotificationPrefs,
} from "../_shared/notificationPrefs.ts";

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

// ── Date labels ──────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return DAY_NAMES[d.getUTCDay()];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

// ── Severity badge ───────────────────────────────────────────────────────────

function severityColor(severity: string): string {
  if (severity === "critical") return "#dc2626";
  if (severity === "warning") return "#d97706";
  return "#2563eb";
}

function alertIcon(type: string): string {
  const icons: Record<string, string> = {
    frost: "🧊",
    rain: "🌧️",
    snow: "❄️",
    heat: "🌡️",
    wind: "💨",
  };
  return icons[type] ?? "⚠️";
}

// ── Types ────────────────────────────────────────────────────────────────────

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
  type?: string | null;
  next_check_at?: string | null;
  window_end_date?: string | null;
  status?: string | null;
}

interface HomeSection {
  name: string;
  forecast: DayForecast[];
  alerts: Alert[];
  tasks: Task[];
}

interface Recipient {
  displayName: string;
  homes: HomeSection[];
}

// ── Email HTML ───────────────────────────────────────────────────────────────

/** One-row-per-day vertical weather strip — fits on mobile email clients
 *  where the previous 7-column horizontal grid (448px wide) was clipped
 *  to 3-5 days on most viewports. */
function renderWeather(forecast: DayForecast[]): string {
  if (forecast.length === 0) return "";
  const rows = forecast
    .map(
      (d) =>
        `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eef3ef;font-size:18px;line-height:1;width:36px;">${d.emoji}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eef3ef;font-size:13px;font-weight:700;color:#0f2a1e;">
            <span style="display:inline-block;width:36px;color:#4a6355;">${dayLabel(d.date)}</span>
            <span style="color:#9aada3;font-weight:600;">${formatDate(d.date)}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eef3ef;font-size:13px;font-weight:800;color:#0f2a1e;text-align:right;white-space:nowrap;">
            ${Math.round(d.maxC)}° <span style="color:#8a9e94;font-weight:600;">/ ${Math.round(d.minC)}°</span>
          </td>
        </tr>`,
    )
    .join("\n");
  return `<div style="margin:0 0 24px;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Weather this week</p>
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;background:#fafafa;border-radius:10px;overflow:hidden;">
      ${rows}
    </table>
  </div>`;
}

function renderAlerts(alerts: Alert[]): string {
  if (alerts.length === 0) return "";
  return `<div style="margin:0 0 24px;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Weather alerts</p>
    ${alerts
      .map(
        (a) =>
          `<div style="padding:10px 14px;border-radius:8px;background:#fafafa;border-left:3px solid ${severityColor(a.severity)};margin-bottom:8px;">
            <span style="font-size:16px;margin-right:6px;">${alertIcon(a.type)}</span>
            <span style="font-size:13px;color:#4a6355;line-height:1.5;">${a.message}</span>
          </div>`,
      )
      .join("\n")}
  </div>`;
}

/** Each task row is now a clickable <a> that lands on the Calendar
 *  agenda for that day — `/dashboard?view=calendar&date=YYYY-MM-DD`
 *  is the existing URL contract honoured by TaskCalendar's effect. */
function renderTasks(tasks: Task[]): string {
  if (tasks.length === 0) {
    return `<div style="margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Tasks this week</p>
      <p style="margin:0;font-size:13px;color:#9aada3;">All clear — no pending tasks.</p>
    </div>`;
  }
  return `<div style="margin:0 0 24px;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#9aada3;">Tasks this week</p>
    ${tasks
      .map((t) => {
        const dayStr = t.due_date.split("T")[0];
        const href = `${SITE_URL}/dashboard?view=calendar&date=${dayStr}`;
        return `<a href="${href}" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:8px;background:#fafafa;margin-bottom:6px;text-decoration:none;color:inherit;">
          <span style="font-size:13px;color:#9aada3;font-weight:600;min-width:60px;">${formatDate(dayStr)}</span>
          <span style="flex:1;font-size:13px;color:#0f2a1e;font-weight:600;">${t.title}</span>
          <span style="font-size:13px;color:#075737;font-weight:800;">→</span>
        </a>`;
      })
      .join("\n")}
  </div>`;
}

function renderHomeSection(section: HomeSection, includeHomeHeader: boolean): string {
  const header = includeHomeHeader
    ? `<div style="margin:0 0 16px;padding:12px 14px;background:#075737;border-radius:8px;">
        <p style="margin:0;color:#ffffff;font-size:13px;font-weight:800;letter-spacing:0.01em;">${section.name}</p>
      </div>`
    : "";
  return `${header}
    ${renderWeather(section.forecast)}
    ${renderAlerts(section.alerts)}
    ${renderTasks(section.tasks)}`;
}

function buildEmail(
  recipient: Recipient,
  monday: string,
  sunday: string,
): string {
  const weekRange = `${formatDate(monday)} – ${formatDate(sunday)}`;
  const multiHome = recipient.homes.length > 1;
  const greeting = multiHome
    ? `Hi ${recipient.displayName}, here's what's coming up across your <strong>${recipient.homes.length}</strong> gardens — ${weekRange}.`
    : `Hi ${recipient.displayName}, here's what's coming up at <strong>${recipient.homes[0].name}</strong> — ${weekRange}.`;
  const sections = recipient.homes
    .map((home) => renderHomeSection(home, multiHome))
    .join("\n");

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
      <div style="background-color:#075737;padding:28px 40px;text-align:center;">
        <p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Rhozly</p>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;">Your week in the garden</p>
      </div>
      <div style="padding:32px 36px;">
        <p style="margin:0 0 24px;font-size:15px;color:#4a6355;line-height:1.6;">${greeting}</p>
        ${sections}
        <a href="${SITE_URL}/dashboard?view=calendar" style="display:block;background-color:#075737;color:#ffffff;text-decoration:none;text-align:center;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.01em;margin-top:8px;">Open this week in Rhozly →</a>
      </div>
      <div style="padding:18px 36px;border-top:1px solid #e8f0eb;">
        <p style="margin:0;font-size:12px;color:#9aada3;line-height:1.6;">
          You're getting this digest because Weekly Garden Overview is on in your <a href="${SITE_URL}/gardener?tab=notifications" style="color:#075737;font-weight:700;text-decoration:underline;">Notifications</a> settings.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Data collection per home ─────────────────────────────────────────────────

interface HomeBundle {
  homeId: string;
  homeName: string;
  members: Array<{ user_id: string; email: string; display_name: string | null }>;
  forecast: DayForecast[];
  alerts: Alert[];
  tasks: Task[];
}

async function collectHome(
  supabase: any,
  home: { id: string; name: string },
  monday: string,
  sunday: string,
): Promise<HomeBundle | null> {
  // 1. Members + email
  const { data: memberRows } = await supabase
    .from("home_members")
    .select("user_id")
    .eq("home_id", home.id);
  if (!memberRows || memberRows.length === 0) return null;

  const userIds = memberRows.map((m: any) => m.user_id);
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("uid, email, display_name")
    .in("uid", userIds);

  const members = ((profiles ?? []) as any[])
    .filter((p) => p.email)
    .map((p) => ({ user_id: p.uid, email: p.email, display_name: p.display_name }));
  if (members.length === 0) {
    warn(FN, "no_emails", { homeId: home.id });
    return null;
  }

  // 2. Weather
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

  // 3. Active alerts (deduped by type+message)
  const { data: locations } = await supabase
    .from("locations")
    .select("id")
    .eq("home_id", home.id);
  const locationIds = (locations ?? []).map((l: any) => l.id);

  const alerts: Alert[] = [];
  if (locationIds.length > 0) {
    const { data: alertRows } = await supabase
      .from("weather_alerts")
      .select("type, severity, message")
      .in("location_id", locationIds)
      .eq("is_active", true);
    const seen = new Set<string>();
    for (const a of alertRows ?? []) {
      const key = `${a.type}:${a.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        alerts.push(a);
      }
    }
  }

  // 4. Tasks due this week — pull snooze + window columns so we can run
  //    the Wave 20+ filter in memory. Without this filter, "Not yet → 3 days"
  //    snoozes still showed in the email; the in-app calendar already hides them.
  const { data: rawTasks } = await supabase
    .from("tasks")
    .select("title, due_date, type, next_check_at, window_end_date, status")
    .eq("home_id", home.id)
    .eq("status", "Pending")
    .gte("due_date", monday)
    .lte("due_date", sunday + "T23:59:59Z")
    .order("due_date", { ascending: true });

  const tasks: Task[] = ((rawTasks ?? []) as Task[]).filter((t) => {
    // Use the same "actionable today through end of window" semantics
    // the dashboard uses, applied across the week range. A task is
    // included if it's visible on ANY day of the digest window.
    for (let d = new Date(monday + "T00:00:00Z"); d.toISOString().split("T")[0] <= sunday; d.setUTCDate(d.getUTCDate() + 1)) {
      const dayStr = d.toISOString().split("T")[0];
      if (isTaskVisibleOnDate(t, dayStr, { includeOverdue: false })) return true;
    }
    return false;
  });

  return {
    homeId: home.id,
    homeName: home.name,
    members,
    forecast,
    alerts,
    tasks,
  };
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

    // Materialise blueprint tasks for the week so the query below sees them.
    try {
      await supabase.functions.invoke("generate-tasks", { body: {} });
      log(FN, "generate_tasks_complete");
    } catch (err: any) {
      warn(FN, "generate_tasks_failed", { error: err.message });
    }

    const { data: homes, error: homesErr } = await supabase
      .from("homes")
      .select("id, name");
    if (homesErr) throw homesErr;
    if (!homes || homes.length === 0) {
      log(FN, "no_homes");
      return new Response(JSON.stringify({ message: "No homes." }), { status: 200 });
    }

    // Per-user notification prefs (server-side; sparse jsonb).
    const { data: allProfileRows } = await supabase
      .from("user_profiles")
      .select("uid, notification_prefs");
    const prefsByUser: Record<string, NotificationPrefs> = {};
    for (const row of (allProfileRows ?? []) as Array<{ uid: string; notification_prefs: NotificationPrefs | null }>) {
      prefsByUser[row.uid] = row.notification_prefs ?? {};
    }

    // Collect data per home (sequential — keeps memory predictable
    // across many homes; each home is small so it's still fast).
    const bundles: HomeBundle[] = [];
    for (const home of homes) {
      try {
        const bundle = await collectHome(supabase, home, monday, sunday);
        if (bundle) bundles.push(bundle);
      } catch (err: any) {
        logError(FN, "home_error", { homeId: home.id, error: err.message });
      }
    }

    // Build recipient map. Default style is "combined" — one email per
    // unique address with sections per home. Users who chose "per_home"
    // get the legacy fan-out (one email per home, addressed only by that
    // home). When recipients in the same email address have conflicting
    // styles across homes, "per_home" wins (more conservative — they
    // chose to be split, so respect that for any home they're in).
    const recipientStyleByEmail = new Map<string, DigestStyle>();
    for (const bundle of bundles) {
      for (const member of bundle.members) {
        const style = getDigestStyle(prefsByUser[member.user_id]);
        const current = recipientStyleByEmail.get(member.email);
        if (current === "per_home" || style === "per_home") {
          recipientStyleByEmail.set(member.email, "per_home");
        } else {
          recipientStyleByEmail.set(member.email, "combined");
        }
      }
    }

    const recipientsByEmail = new Map<string, Recipient>();
    const perHomeRecipients: Array<{ email: string; recipient: Recipient }> = [];

    for (const bundle of bundles) {
      for (const member of bundle.members) {
        // Respect "Weekly garden overview" mute.
        if (!shouldNotify(prefsByUser[member.user_id], "weeklyOverview")) continue;

        const displayName = member.display_name ?? member.email.split("@")[0];
        const section: HomeSection = {
          name: bundle.homeName,
          forecast: bundle.forecast,
          alerts: bundle.alerts,
          tasks: bundle.tasks,
        };
        const style = recipientStyleByEmail.get(member.email) ?? "combined";
        if (style === "per_home") {
          perHomeRecipients.push({
            email: member.email,
            recipient: { displayName, homes: [section] },
          });
        } else {
          const existing = recipientsByEmail.get(member.email);
          if (existing) {
            // Don't double-add the same home for the same email
            if (!existing.homes.find((h) => h.name === section.name)) {
              existing.homes.push(section);
            }
          } else {
            recipientsByEmail.set(member.email, {
              displayName,
              homes: [section],
            });
          }
        }
      }
    }

    let totalSent = 0;
    let totalSkipped = 0;

    const subject = `🌿 Your week in the garden — ${formatDate(monday)}`;
    for (const [email, recipient] of recipientsByEmail) {
      try {
        await sendEmail({
          from: "Rhozly <info@rhozly.com>",
          to: email,
          subject,
          html: buildEmail(recipient, monday, sunday),
        });
        totalSent++;
        log(FN, "email_sent", { to: email, homes: recipient.homes.length, style: "combined" });
      } catch (err: any) {
        totalSkipped++;
        warn(FN, "email_failed", { to: email, error: err.message });
      }
    }

    for (const { email, recipient } of perHomeRecipients) {
      try {
        await sendEmail({
          from: "Rhozly <info@rhozly.com>",
          to: email,
          subject: `🌿 ${recipient.homes[0].name} — week of ${formatDate(monday)}`,
          html: buildEmail(recipient, monday, sunday),
        });
        totalSent++;
        log(FN, "email_sent", { to: email, homes: 1, style: "per_home" });
      } catch (err: any) {
        totalSkipped++;
        warn(FN, "email_failed", { to: email, error: err.message });
      }
    }

    log(FN, "complete", {
      homes: bundles.length,
      combinedRecipients: recipientsByEmail.size,
      perHomeRecipients: perHomeRecipients.length,
      sent: totalSent,
      skipped: totalSkipped,
    });
    return new Response(
      JSON.stringify({ success: true, sent: totalSent, skipped: totalSkipped }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    logError(FN, "fatal", { error: err.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
