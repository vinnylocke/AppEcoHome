import { describe, test, expect } from "vitest";
import {
  getFrequencyDays,
  getHemisphere,
  normalizePeriods,
  getSinglePeriodRange,
} from "../../../src/lib/seasonal";

// ---- getFrequencyDays ----

describe("getFrequencyDays", () => {
  test("returns 3 for 'frequent' watering", () => {
    expect(getFrequencyDays("Frequent watering")).toBe(3);
  });

  test("returns 7 for 'average' watering", () => {
    expect(getFrequencyDays("Average")).toBe(7);
  });

  test("returns 21 for 'minimum' watering", () => {
    expect(getFrequencyDays("Minimum water")).toBe(21);
  });

  test("returns 7 as default for unrecognised string", () => {
    expect(getFrequencyDays("unknown")).toBe(7);
  });

  test("returns 7 as default for empty string", () => {
    expect(getFrequencyDays("")).toBe(7);
  });

  test("is case-insensitive", () => {
    expect(getFrequencyDays("FREQUENT")).toBe(3);
    expect(getFrequencyDays("MINIMUM")).toBe(21);
  });
});

// ---- getHemisphere ----

describe("getHemisphere", () => {
  test("returns 'southern' for Australia", () => {
    expect(getHemisphere("Australia", undefined)).toBe("southern");
  });

  test("returns 'southern' for Brazil", () => {
    expect(getHemisphere("Brazil", undefined)).toBe("southern");
  });

  test("returns 'southern' when timezone contains 'australia'", () => {
    expect(getHemisphere(undefined, "Australia/Sydney")).toBe("southern");
  });

  test("returns 'northern' for United Kingdom", () => {
    expect(getHemisphere("United Kingdom", undefined)).toBe("northern");
  });

  test("returns 'northern' for US timezone", () => {
    expect(getHemisphere(undefined, "America/New_York")).toBe("northern");
  });

  test("returns 'northern' when both arguments are undefined", () => {
    expect(getHemisphere(undefined, undefined)).toBe("northern");
  });

  test("is case-insensitive", () => {
    expect(getHemisphere("AUSTRALIA", undefined)).toBe("southern");
  });
});

// ---- normalizePeriods ----

describe("normalizePeriods", () => {
  test("splits comma-separated string into array", () => {
    expect(normalizePeriods("spring, summer")).toEqual(["spring", "summer"]);
  });

  test("splits 'and'-separated string into array", () => {
    expect(normalizePeriods("spring and summer")).toEqual(["spring", "summer"]);
  });

  test("passes through an existing array", () => {
    expect(normalizePeriods(["spring", "summer"])).toEqual(["spring", "summer"]);
  });

  test("flattens nested arrays", () => {
    expect(normalizePeriods(["spring, summer", "autumn"])).toEqual([
      "spring",
      "summer",
      "autumn",
    ]);
  });

  test("returns [] for null", () => {
    expect(normalizePeriods(null)).toEqual([]);
  });

  test("returns [] for undefined", () => {
    expect(normalizePeriods(undefined)).toEqual([]);
  });

  test("filters out empty strings from splits", () => {
    expect(normalizePeriods("spring,,summer").every(Boolean)).toBe(true);
  });

  test("returns [] for non-string, non-array truthy value", () => {
    expect(normalizePeriods(42 as any)).toEqual([]);
    expect(normalizePeriods({} as any)).toEqual([]);
  });
});

// ---- getSinglePeriodRange ----

describe("getSinglePeriodRange — named seasons", () => {
  test("northern spring = Mar–May", () => {
    expect(getSinglePeriodRange("spring", "northern")).toEqual({
      start: "03-01",
      end: "05-31",
    });
  });

  test("southern spring = Sep–Nov", () => {
    expect(getSinglePeriodRange("spring", "southern")).toEqual({
      start: "09-01",
      end: "11-30",
    });
  });

  test("northern summer = Jun–Aug", () => {
    expect(getSinglePeriodRange("summer", "northern")).toEqual({
      start: "06-01",
      end: "08-31",
    });
  });

  test("southern summer = Dec–Feb", () => {
    expect(getSinglePeriodRange("summer", "southern")).toEqual({
      start: "12-01",
      end: "02-28",
    });
  });

  test("northern winter = Dec–Feb", () => {
    expect(getSinglePeriodRange("winter", "northern")).toEqual({
      start: "12-01",
      end: "02-28",
    });
  });

  test("southern winter = Jun–Aug", () => {
    expect(getSinglePeriodRange("winter", "southern")).toEqual({
      start: "06-01",
      end: "08-31",
    });
  });

  test("northern autumn/fall = Sep–Nov", () => {
    expect(getSinglePeriodRange("fall", "northern")).toEqual({
      start: "09-01",
      end: "11-30",
    });
    expect(getSinglePeriodRange("autumn", "northern")).toEqual({
      start: "09-01",
      end: "11-30",
    });
  });
});

describe("getSinglePeriodRange — calendar months", () => {
  test("january → 01-01 to 01-31 (hemisphere-independent)", () => {
    expect(getSinglePeriodRange("january", "northern")).toEqual({
      start: "01-01",
      end: "01-31",
    });
    expect(getSinglePeriodRange("january", "southern")).toEqual({
      start: "01-01",
      end: "01-31",
    });
  });

  test("june → 06-01 to 06-30", () => {
    expect(getSinglePeriodRange("june", "northern")).toEqual({
      start: "06-01",
      end: "06-30",
    });
  });

  test("december → 12-01 to 12-31", () => {
    expect(getSinglePeriodRange("december", "northern")).toEqual({
      start: "12-01",
      end: "12-31",
    });
  });

  test("unrecognised period returns full-year fallback", () => {
    expect(getSinglePeriodRange("whenever", "northern")).toEqual({
      start: "01-01",
      end: "12-31",
    });
  });
});
