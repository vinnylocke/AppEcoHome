import { describe, test, expect } from "vitest";
import { validateManualReading } from "../../../src/services/areaReadingsService";

// Phase 2 — manual area metric validation. Pure function so we cover
// every edge in unit tests; the real INSERT path gets covered by E2E.

const baseInput = {
  homeId: "00000000-0000-0000-0000-000000000001",
  areaId: "00000000-0000-0000-0000-000000000002",
};

describe("validateManualReading", () => {
  test("empty input → nothing_entered", () => {
    expect(validateManualReading(baseInput)).toBe("nothing_entered");
  });

  test("just a moisture value → null (valid)", () => {
    expect(validateManualReading({ ...baseInput, moisturePct: 42 })).toBeNull();
  });

  test("moisture at the edges (0 and 100) → null", () => {
    expect(validateManualReading({ ...baseInput, moisturePct: 0 })).toBeNull();
    expect(validateManualReading({ ...baseInput, moisturePct: 100 })).toBeNull();
  });

  test("moisture out of range → error", () => {
    expect(validateManualReading({ ...baseInput, moisturePct: -1 })).toBe("moisture_out_of_range");
    expect(validateManualReading({ ...baseInput, moisturePct: 101 })).toBe("moisture_out_of_range");
    expect(validateManualReading({ ...baseInput, moisturePct: NaN })).toBe("moisture_out_of_range");
  });

  test("temp at typical edges (-50 / 80 °C) → null", () => {
    expect(validateManualReading({ ...baseInput, tempC: -50 })).toBeNull();
    expect(validateManualReading({ ...baseInput, tempC: 80 })).toBeNull();
  });

  test("temp out of range → error", () => {
    expect(validateManualReading({ ...baseInput, tempC: -51 })).toBe("temp_out_of_range");
    expect(validateManualReading({ ...baseInput, tempC: 81 })).toBe("temp_out_of_range");
    expect(validateManualReading({ ...baseInput, tempC: Infinity })).toBe("temp_out_of_range");
  });

  test("ec value at 0 and 100000 → null", () => {
    expect(validateManualReading({ ...baseInput, ec: 0 })).toBeNull();
    expect(validateManualReading({ ...baseInput, ec: 100000 })).toBeNull();
  });

  test("ec out of range → error", () => {
    expect(validateManualReading({ ...baseInput, ec: -1 })).toBe("ec_out_of_range");
    expect(validateManualReading({ ...baseInput, ec: 100001 })).toBe("ec_out_of_range");
  });

  test("ec source validation — accepts both enums", () => {
    expect(validateManualReading({ ...baseInput, ec: 1200, ecSource: "calibrated_us_cm" })).toBeNull();
    expect(validateManualReading({ ...baseInput, ec: 850, ecSource: "raw_adc" })).toBeNull();
  });

  test("ec source validation — rejects unknown values", () => {
    expect(
      validateManualReading({ ...baseInput, ec: 1200, ecSource: "bogus" as any }),
    ).toBe("ec_source_invalid");
  });

  test("ec source ignored when no ec value supplied", () => {
    expect(
      validateManualReading({ ...baseInput, moisturePct: 50, ecSource: "bogus" as any }),
    ).toBeNull();
  });

  test("all three metrics together → valid", () => {
    expect(
      validateManualReading({
        ...baseInput,
        moisturePct: 50,
        tempC: 18.4,
        ec: 1200,
        ecSource: "calibrated_us_cm",
      }),
    ).toBeNull();
  });
});
