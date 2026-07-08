// Server-side mirror of `rhozly_notif_prefs` (the localStorage object
// the Notifications tab writes). Stored in `user_profiles.notification_prefs`
// as a sparse jsonb. Missing keys default to "send" so existing users who
// haven't toggled anything keep getting their notifications.

export type DigestStyle = "combined" | "per_home";

export interface NotificationPrefs {
  master?: boolean;
  watering?: boolean;
  harvesting?: boolean;
  pruning?: boolean;
  weatherAlerts?: boolean;
  goldenHour?: boolean;
  optimiseDigest?: boolean;
  weeklyOverview?: boolean;
  betaPrompts?: boolean;
  /** 20:00-local nudge when tasks are still overdue (2026-07-08). */
  overdueEvening?: boolean;
  /** "combined" = one email per recipient with sections per home; "per_home" = the legacy fan-out (one email per home). */
  digestStyle?: DigestStyle;
  /** "HH:MM" local time the daily task digest is delivered (default "08:00"). */
  reminderTime?: string;
}

/** True if the user wants to receive notifications of this category.
 *  Defaults to true when either the master switch is unset OR the
 *  per-category switch is unset. Only an explicit `false` mutes. */
export function shouldNotify(
  prefs: NotificationPrefs | null | undefined,
  category: Exclude<keyof NotificationPrefs, "master" | "digestStyle">,
): boolean {
  if (!prefs) return true;
  if (prefs.master === false) return false;
  const value = prefs[category];
  if (value === false) return false;
  return true;
}

export function getDigestStyle(prefs: NotificationPrefs | null | undefined): DigestStyle {
  return prefs?.digestStyle === "per_home" ? "per_home" : "combined";
}

/** Pick the per-category preference from a task type — used by
 *  daily-batch-notifications to decide whether to surface a particular
 *  task in the aggregated reminder. */
export function categoryForTaskType(
  taskType: string | null | undefined,
): Exclude<keyof NotificationPrefs, "master" | "digestStyle"> | null {
  if (!taskType) return null;
  const t = taskType.toLowerCase();
  if (t === "watering") return "watering";
  if (t === "harvesting" || t === "harvest") return "harvesting";
  if (t === "pruning") return "pruning";
  return null; // Fertilizing/Inspection/Maintenance/etc fall through to "send"
}
