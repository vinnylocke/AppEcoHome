/**
 * Build an iCalendar (RFC 5545) string from a list of tasks, suitable for
 * one-shot export and import into Google Calendar, Apple Calendar, Outlook,
 * etc. This is a *snapshot* export — the user re-runs it when they want a
 * refreshed copy; we don't host a subscribe-able feed.
 */

export interface IcsTask {
  id: string;
  title: string;
  description?: string | null;
  due_date: string; // ISO date or datetime
  type?: string;
}

const escapeText = (input: string): string =>
  input
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const formatDateAllDay = (iso: string): string => {
  // Treat date-only ISO strings as floating all-day events. Strip dashes.
  const datePart = iso.split("T")[0];
  return datePart.replace(/-/g, "");
};

const formatDtStamp = (): string => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${hh}${mm}${ss}Z`;
};

const foldLine = (line: string): string => {
  // RFC 5545 says lines longer than 75 octets must be folded with CRLF + space.
  // Keep this simple — split every 73 chars.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += 73) {
    chunks.push(line.slice(i, i + 73));
  }
  return chunks.join("\r\n ");
};

/**
 * Build the .ics text for a list of tasks.
 *
 * Each task becomes a VEVENT with an all-day DTSTART (DATE value) so calendars
 * render the task as a banner on the due date rather than at midnight UTC.
 */
export function buildTasksIcs(tasks: IcsTask[], calendarName = "Rhozly Tasks"): string {
  const dtstamp = formatDtStamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rhozly//Tasks Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const task of tasks) {
    const dtstart = formatDateAllDay(task.due_date);
    // DTEND for all-day events is exclusive — same as DTSTART + 1 day.
    const startDate = new Date(`${task.due_date.split("T")[0]}T00:00:00Z`);
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    const dtend = `${endDate.getUTCFullYear()}${String(endDate.getUTCMonth() + 1).padStart(2, "0")}${String(endDate.getUTCDate()).padStart(2, "0")}`;

    const summary = task.type ? `${task.type}: ${task.title}` : task.title;
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:rhozly-task-${task.id}@rhozly.com`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    lines.push(`DTEND;VALUE=DATE:${dtend}`);
    lines.push(foldLine(`SUMMARY:${escapeText(summary)}`));
    if (task.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(task.description)}`));
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Trigger a download in the browser of the given ICS text as `filename`.
 */
export function downloadIcs(icsText: string, filename = "rhozly-tasks.ics"): void {
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
