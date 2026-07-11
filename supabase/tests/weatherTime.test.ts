import { assertEquals } from "@std/assert";
import { localNaiveToUtc, localToday, snapshotOffsetSeconds } from "@shared/weatherTime.ts";

// A fixed instant to make the tz maths deterministic:
// 2026-07-11T05:30:00Z.
const NOW = Date.parse("2026-07-11T05:30:00Z");

// ─── snapshotOffsetSeconds ───────────────────────────────────────────────────

Deno.test("WT-001: offset reads utc_offset_seconds; 0 when absent/NaN/null", () => {
  assertEquals(snapshotOffsetSeconds({ utc_offset_seconds: 3600 }), 3600);
  assertEquals(snapshotOffsetSeconds({ utc_offset_seconds: -28800 }), -28800);
  assertEquals(snapshotOffsetSeconds({}), 0);
  assertEquals(snapshotOffsetSeconds(null), 0);
  assertEquals(snapshotOffsetSeconds({ utc_offset_seconds: Number.NaN }), 0);
});

// ─── localToday ──────────────────────────────────────────────────────────────

Deno.test("WT-002: localToday matches UTC when offset is 0", () => {
  assertEquals(localToday({ utc_offset_seconds: 0 }, NOW), "2026-07-11");
});

Deno.test("WT-003: a west-of-UTC home before local midnight is still the PREVIOUS day", () => {
  // 05:30Z is 21:30 the previous day in US-Pacific (-8h) → local date is Jul 10,
  // not Jul 11. This is the rain-auto-complete-a-day-early bug.
  assertEquals(localToday({ utc_offset_seconds: -8 * 3600 }, NOW), "2026-07-10");
});

Deno.test("WT-004: an east-of-UTC home past local midnight is the NEXT day", () => {
  // 05:30Z is 15:30 in Sydney (+10h) → still Jul 11. But at 20:00Z it'd be Jul 12.
  assertEquals(localToday({ utc_offset_seconds: 10 * 3600 }, NOW), "2026-07-11");
  assertEquals(localToday({ utc_offset_seconds: 10 * 3600 }, Date.parse("2026-07-11T20:00:00Z")), "2026-07-12");
});

Deno.test("WT-005: missing offset falls back to UTC (old snapshots keep working)", () => {
  assertEquals(localToday({}, NOW), "2026-07-11");
});

// ─── localNaiveToUtc ─────────────────────────────────────────────────────────

Deno.test("WT-006: local-naive hourly stamp → real UTC instant (offset subtracted)", () => {
  // 14:00 local in a +1h home is 13:00Z.
  assertEquals(localNaiveToUtc("2026-07-11T14:00", 3600)?.toISOString(), "2026-07-11T13:00:00.000Z");
  // 14:00 local in a -8h home is 22:00Z.
  assertEquals(localNaiveToUtc("2026-07-11T14:00", -8 * 3600)?.toISOString(), "2026-07-11T22:00:00.000Z");
  // offset 0 → same wall clock as UTC.
  assertEquals(localNaiveToUtc("2026-07-11T14:00", 0)?.toISOString(), "2026-07-11T14:00:00.000Z");
});

Deno.test("WT-007: accepts stamps that already carry seconds", () => {
  assertEquals(localNaiveToUtc("2026-07-11T14:00:00", 3600)?.toISOString(), "2026-07-11T13:00:00.000Z");
});

Deno.test("WT-008: unparseable / empty input → null (skipped by callers)", () => {
  assertEquals(localNaiveToUtc("not-a-date", 3600), null);
  assertEquals(localNaiveToUtc("", 3600), null);
});
