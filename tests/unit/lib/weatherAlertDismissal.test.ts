import { describe, it, expect } from "vitest";
import {
  isDismissedToday, dismiss, undismiss, parseDismissed, todayLocal,
} from "../../../src/lib/weatherAlertDismissal";

describe("weatherAlertDismissal", () => {
  it("todayLocal returns a zero-padded local YYYY-MM-DD", () => {
    expect(todayLocal(new Date(2026, 5, 23))).toBe("2026-06-23");
    expect(todayLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("isDismissedToday — true only when the type's stored date is today (reappears next day)", () => {
    const map = { heat: "2026-06-23" };
    expect(isDismissedToday(map, "heat", "2026-06-23")).toBe(true);
    expect(isDismissedToday(map, "heat", "2026-06-24")).toBe(false); // new day → shows again
    expect(isDismissedToday(map, "frost", "2026-06-23")).toBe(false); // per-type isolation
  });

  it("dismiss — sets the type's date, leaves others, immutable", () => {
    const map = { frost: "2026-06-20" };
    const next = dismiss(map, "heat", "2026-06-23");
    expect(next).toEqual({ frost: "2026-06-20", heat: "2026-06-23" });
    expect(map).toEqual({ frost: "2026-06-20" });
  });

  it("undismiss — removes a type", () => {
    expect(undismiss({ heat: "2026-06-23", frost: "2026-06-23" }, "heat")).toEqual({ frost: "2026-06-23" });
  });

  it("parseDismissed — drops the legacy id-array (permanent) format", () => {
    expect(parseDismissed(["id1", "id2"])).toEqual({});
  });

  it("parseDismissed — keeps a valid map, dropping non-string values", () => {
    expect(parseDismissed({ heat: "2026-06-23", bad: 5, frost: "2026-06-24" }))
      .toEqual({ heat: "2026-06-23", frost: "2026-06-24" });
  });

  it("parseDismissed — total on junk", () => {
    expect(parseDismissed(null)).toEqual({});
    expect(parseDismissed("x")).toEqual({});
    expect(parseDismissed(42)).toEqual({});
  });
});
