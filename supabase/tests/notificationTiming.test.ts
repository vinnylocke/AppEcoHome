import { assert, assertEquals } from "@std/assert";
import { localMinutesOfDay, isReminderDue, isNearSunset } from "@shared/notificationTiming.ts";

// ── localMinutesOfDay ────────────────────────────────────────────────────────

Deno.test("localMinutesOfDay — tz-aware minutes of day", () => {
  // 10:00 UTC → 11:00 in London (BST, June) → 660.
  assertEquals(localMinutesOfDay(new Date("2026-06-19T10:00:00Z"), "Europe/London"), 660);
  assertEquals(localMinutesOfDay(new Date("2026-06-19T10:00:00Z"), "UTC"), 600);
  // 02:00 UTC → 22:00 previous day in New York (EDT, UTC-4, June) → 1320.
  assertEquals(localMinutesOfDay(new Date("2026-06-19T02:00:00Z"), "America/New_York"), 1320);
});

// ── isReminderDue ────────────────────────────────────────────────────────────

Deno.test("isReminderDue — fires at/just-past the reminder, within one tick", () => {
  assert(isReminderDue(17 * 60, "17:00", 15));          // exactly 17:00
  assert(isReminderDue(17 * 60 + 14, "17:00", 15));     // 17:14 still in [17:00,17:15)
  assert(!isReminderDue(17 * 60 + 15, "17:00", 15));    // 17:15 — next window, dedup-era
  assert(!isReminderDue(16 * 60 + 59, "17:00", 15));    // 16:59 — before
});

Deno.test("isReminderDue — non-aligned reminder fires on the next tick window", () => {
  // reminder 17:07: 17:00 tick (1020) is before; the 17:15 tick (1035) is in [1027,1042).
  assert(!isReminderDue(17 * 60, "17:07", 15));
  assert(isReminderDue(17 * 60 + 15, "17:07", 15));
});

Deno.test("isReminderDue — malformed reminder defaults to 08:00", () => {
  assert(isReminderDue(8 * 60, "", 15));
  assert(isReminderDue(8 * 60, "nonsense", 15));
});

// ── isNearSunset ─────────────────────────────────────────────────────────────

Deno.test("isNearSunset — within the 30–75 min pre-sunset window", () => {
  const sunset = new Date("2026-06-19T20:00:00Z");
  assert(isNearSunset(new Date("2026-06-19T19:15:00Z"), sunset));   // 45 min before → in
  assert(isNearSunset(new Date("2026-06-19T19:25:00Z"), sunset));   // 35 min before → in
  assert(!isNearSunset(new Date("2026-06-19T19:45:00Z"), sunset));  // 15 min before → too late
  assert(!isNearSunset(new Date("2026-06-19T18:30:00Z"), sunset));  // 90 min before → too early
  assert(!isNearSunset(new Date("2026-06-19T20:05:00Z"), sunset));  // after sunset → no
});
