import { assertEquals } from "@std/assert";
import { isTaskActionableToday, isTaskVisibleOnDate } from "@shared/taskFilters.ts";
import {
  categoryForTaskType,
  getDigestStyle,
  shouldNotify,
} from "@shared/notificationPrefs.ts";

// ── Date helpers — all dates are anchored on a fixed reference so the
//    tests stay stable regardless of when they run. ─────────────────────

const TODAY = "2026-06-15";
const YESTERDAY = "2026-06-14";
const TOMORROW = "2026-06-16";
const IN_3_DAYS = "2026-06-18";
const WEEK_AHEAD = "2026-06-22";
const PAST_WEEK = "2026-06-08";

// ── taskFilters — mirror of tests/unit/lib/taskFilters.test.ts ────────

Deno.test("isTaskActionableToday — non-window pending due today", () => {
  assertEquals(
    isTaskActionableToday({ status: "Pending", due_date: TODAY }, TODAY),
    true,
  );
});

Deno.test("isTaskActionableToday — overdue (yesterday) is still actionable", () => {
  assertEquals(
    isTaskActionableToday({ status: "Pending", due_date: YESTERDAY }, TODAY),
    true,
  );
});

Deno.test("isTaskActionableToday — snoozed-to-tomorrow is NOT actionable today", () => {
  assertEquals(
    isTaskActionableToday(
      { status: "Pending", due_date: YESTERDAY, next_check_at: TOMORROW },
      TODAY,
    ),
    false,
  );
});

Deno.test("isTaskActionableToday — snoozed-to-today IS actionable today", () => {
  // User picked "Not yet 1 day" yesterday → next_check_at = today; the
  // task surfaces again now.
  assertEquals(
    isTaskActionableToday(
      { status: "Pending", due_date: YESTERDAY, next_check_at: TODAY },
      TODAY,
    ),
    true,
  );
});

Deno.test("isTaskActionableToday — Completed task is never actionable", () => {
  assertEquals(
    isTaskActionableToday({ status: "Completed", due_date: TODAY }, TODAY),
    false,
  );
});

Deno.test("isTaskActionableToday — Skipped task is never actionable", () => {
  assertEquals(
    isTaskActionableToday({ status: "Skipped", due_date: YESTERDAY }, TODAY),
    false,
  );
});

Deno.test("isTaskActionableToday — harvest in window is actionable", () => {
  assertEquals(
    isTaskActionableToday(
      { status: "Pending", due_date: YESTERDAY, window_end_date: WEEK_AHEAD },
      TODAY,
    ),
    true,
  );
});

Deno.test("isTaskActionableToday — harvest snoozed past today inside window is NOT actionable today", () => {
  assertEquals(
    isTaskActionableToday(
      {
        status: "Pending",
        due_date: TODAY,
        next_check_at: IN_3_DAYS,
        window_end_date: WEEK_AHEAD,
      },
      TODAY,
    ),
    false,
  );
});

Deno.test("isTaskActionableToday — harvest past window is NOT actionable (stop pestering)", () => {
  assertEquals(
    isTaskActionableToday(
      { status: "Pending", due_date: PAST_WEEK, window_end_date: YESTERDAY },
      TODAY,
    ),
    false,
  );
});

Deno.test("isTaskVisibleOnDate — non-window task with includeOverdue=false shows on its exact effective date", () => {
  assertEquals(
    isTaskVisibleOnDate({ status: "Pending", due_date: TODAY }, TODAY),
    true,
  );
  assertEquals(
    isTaskVisibleOnDate({ status: "Pending", due_date: YESTERDAY }, TODAY),
    false,
  );
});

Deno.test("isTaskVisibleOnDate — snoozed-to-today shows today (effective due = next_check_at)", () => {
  assertEquals(
    isTaskVisibleOnDate(
      { status: "Pending", due_date: YESTERDAY, next_check_at: TODAY },
      TODAY,
    ),
    true,
  );
});

// ── notificationPrefs — server-side respect ───────────────────────────

Deno.test("shouldNotify — no prefs (legacy user) → always true", () => {
  assertEquals(shouldNotify(null, "watering"), true);
  assertEquals(shouldNotify(undefined, "harvesting"), true);
  assertEquals(shouldNotify({}, "weeklyOverview"), true);
});

Deno.test("shouldNotify — master off blocks everything", () => {
  const prefs = { master: false, watering: true };
  assertEquals(shouldNotify(prefs, "watering"), false);
  assertEquals(shouldNotify(prefs, "harvesting"), false);
});

Deno.test("shouldNotify — per-category mute respected", () => {
  const prefs = { master: true, harvesting: false };
  assertEquals(shouldNotify(prefs, "harvesting"), false);
  assertEquals(shouldNotify(prefs, "watering"), true);
});

Deno.test("categoryForTaskType — maps known types case-insensitively", () => {
  assertEquals(categoryForTaskType("Watering"), "watering");
  assertEquals(categoryForTaskType("watering"), "watering");
  assertEquals(categoryForTaskType("Harvesting"), "harvesting");
  assertEquals(categoryForTaskType("Harvest"), "harvesting");
  assertEquals(categoryForTaskType("Pruning"), "pruning");
  assertEquals(categoryForTaskType("Fertilizing"), null);
  assertEquals(categoryForTaskType(null), null);
  assertEquals(categoryForTaskType(""), null);
});

Deno.test("getDigestStyle — defaults to 'combined'", () => {
  assertEquals(getDigestStyle(null), "combined");
  assertEquals(getDigestStyle({}), "combined");
  assertEquals(getDigestStyle({ digestStyle: "combined" }), "combined");
  assertEquals(getDigestStyle({ digestStyle: "per_home" }), "per_home");
});
