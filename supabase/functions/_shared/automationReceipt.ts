// Automation Receipt — the single, opt-in "tell me the outcome" path.
//
// When an automation has a receipt action (action_kind `notification`), the
// runners call `sendReceipt` at each MEANINGFUL run-decision (ran / partial /
// failed / rate-limited / skipped) — never on idle "not due" checks. Without a
// receipt action the automation is silent. `buildReceipt` is pure + tested;
// `sendReceipt` self-gates on the action's presence and fans out one
// notification per home member, returning how many members were alerted.

import { error as logError } from "./logger.ts";

const FN = "automation-receipt";

export type ReceiptKind = "ran" | "partial" | "failed" | "rate_limited" | "skipped_weather";

export interface ReceiptContext {
  automationName: string;
  durationText?: string;          // e.g. "30 minutes" (valve run time)
  valvesFired?: number;
  tasksCompleted?: number;
  rainMm?: number;
  rateLimitCount?: number;        // max runs in the window
  rateLimitWindowHours?: number;  // the window length
  nextEligibleAt?: string;        // ISO — when it can run again
}

function windowLabel(hours?: number): string {
  if (!hours || hours === 24) return "day";
  if (hours === 1) return "hour";
  if (hours === 168) return "week";
  return `${hours}h`;
}

/** Build the receipt title + body for an outcome. Pure — no I/O. */
export function buildReceipt(kind: ReceiptKind, ctx: ReceiptContext): { title: string; body: string } {
  const name = ctx.automationName?.trim() || "Your automation";
  switch (kind) {
    case "ran": {
      const did: string[] = [];
      if (ctx.valvesFired) did.push(`watered ${ctx.valvesFired === 1 ? "a valve" : `${ctx.valvesFired} valves`}${ctx.durationText ? ` for ${ctx.durationText}` : ""}`);
      if (ctx.tasksCompleted) did.push(`completed ${ctx.tasksCompleted === 1 ? "a task" : `${ctx.tasksCompleted} tasks`}`);
      return { title: `${name} ran`, body: did.length ? `Conditions were met — it ${did.join(" and ")}.` : "Conditions were met and it ran." };
    }
    case "partial":
      return { title: `${name} ran — some devices failed`, body: `It ran${ctx.durationText ? ` for ${ctx.durationText}` : ""}, but some devices didn't respond. Check their connections.` };
    case "failed":
      return { title: `${name} failed to run`, body: "A device didn't respond. Check your device connections and try again." };
    case "rate_limited": {
      const lim = ctx.rateLimitCount != null ? ` (max ${ctx.rateLimitCount} per ${windowLabel(ctx.rateLimitWindowHours)})` : "";
      const next = ctx.nextEligibleAt ? ` It can run again on ${ctx.nextEligibleAt.split("T")[0]}.` : "";
      return { title: `${name} held back`, body: `It was due to run but hit its rate limit${lim}.${next} If this happens often, consider easing the limit.` };
    }
    case "skipped_weather":
      return { title: `${name} skipped — rain`, body: `It didn't run because rain is forecast${ctx.rainMm ? ` (${ctx.rainMm}mm)` : ""}.` };
  }
}

/**
 * Send a receipt to every home member IFF the automation has a receipt action.
 * Returns the number of members alerted (0 = no receipt action / no members).
 */
// deno-lint-ignore no-explicit-any
export async function sendReceipt(
  db: any,
  automation: { id: string; home_id: string; name: string },
  kind: ReceiptKind,
  ctx: Omit<ReceiptContext, "automationName"> = {},
): Promise<number> {
  const { data: actions } = await db.from("automation_actions")
    .select("id").eq("automation_id", automation.id).eq("action_kind", "notification").limit(1);
  if (!actions?.length) return 0; // no receipt action → stay silent

  const { data: members } = await db.from("home_members").select("user_id").eq("home_id", automation.home_id);
  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (memberIds.length === 0) return 0;

  const { title, body } = buildReceipt(kind, { ...ctx, automationName: automation.name });
  const rows = memberIds.map((uid: string) => ({
    user_id: uid, home_id: automation.home_id, title, body,
    type: "automation_receipt", data: { route: "/integrations", automationId: automation.id }, is_read: false,
  }));
  const { error } = await db.from("notifications").insert(rows);
  if (error) { logError(FN, "receipt_insert_failed", { automation_id: automation.id, message: error.message }); return 0; }
  return rows.length;
}
