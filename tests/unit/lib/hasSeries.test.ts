import { describe, it, expect } from "vitest";
import { hasSeries } from "../../../src/lib/integrations/hasSeries";

describe("hasSeries", () => {
  it("true when at least one row has a finite number for the key", () => {
    expect(hasSeries([{ soil_ec: null }, { soil_ec: 1.2 }], "soil_ec")).toBe(true);
  });

  it("false when no row has the key (e.g. WH51 with no EC)", () => {
    expect(hasSeries([{ soil_moisture: 60 }, { soil_moisture: 55 }], "soil_ec")).toBe(false);
  });

  it("ignores non-finite values", () => {
    expect(hasSeries([{ soil_ec: NaN }, { soil_ec: Infinity }], "soil_ec")).toBe(false);
  });

  it("counts zero as present", () => {
    expect(hasSeries([{ soil_ec: 0 }], "soil_ec")).toBe(true);
  });

  it("false for empty data", () => {
    expect(hasSeries([], "soil_ec")).toBe(false);
  });
});
