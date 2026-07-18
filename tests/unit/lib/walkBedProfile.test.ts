import { describe, it, expect } from "vitest";
import {
  buildBedProfilePatch,
  bedProfileHasChanges,
  validateBedProfile,
  type BedProfileCurrent,
} from "../../../src/lib/walkBedProfile";

const CURRENT: BedProfileCurrent = {
  medium_ph: 6.5,
  light_intensity_lux: 25000,
  water_movement: "Well-Drained",
  nutrient_source: null,
};

const unchanged = {
  ph: "6.5",
  lux: "25000",
  waterMovement: "Well-Drained",
  nutrientSource: "",
};

describe("validateBedProfile", () => {
  it("accepts in-range and empty fields", () => {
    expect(validateBedProfile(unchanged)).toBeNull();
    expect(validateBedProfile({ ph: "0", lux: "0", waterMovement: "", nutrientSource: "" })).toBeNull();
    expect(validateBedProfile({ ph: "14", lux: "", waterMovement: "", nutrientSource: "" })).toBeNull();
    expect(validateBedProfile({ ph: "", lux: "", waterMovement: "", nutrientSource: "" })).toBeNull();
  });

  it("rejects out-of-range or non-numeric pH", () => {
    for (const ph of ["-0.1", "14.1", "acid"]) {
      expect(validateBedProfile({ ...unchanged, ph })).toBe("ph_out_of_range");
    }
  });

  it("rejects negative or non-numeric lux", () => {
    for (const lux of ["-1", "bright"]) {
      expect(validateBedProfile({ ...unchanged, lux })).toBe("lux_out_of_range");
    }
  });
});

describe("buildBedProfilePatch", () => {
  it("all-unchanged inputs produce an empty patch and no lux reading", () => {
    const diff = buildBedProfilePatch(CURRENT, unchanged);
    expect(diff.patch).toEqual({});
    expect(diff.luxReading).toBeNull();
    expect(bedProfileHasChanges(diff)).toBe(false);
  });

  it("only changed fields land in the patch (no clobbering)", () => {
    const diff = buildBedProfilePatch(CURRENT, { ...unchanged, ph: "6.8" });
    expect(diff.patch).toEqual({ medium_ph: 6.8 });
    expect(diff.luxReading).toBeNull();
  });

  it("a new lux value patches the column AND requests a lux reading", () => {
    const diff = buildBedProfilePatch(CURRENT, { ...unchanged, lux: "42000" });
    expect(diff.patch).toEqual({ light_intensity_lux: 42000 });
    expect(diff.luxReading).toBe(42000);
  });

  it("clearing a numeric field nulls the column but logs no reading", () => {
    const diff = buildBedProfilePatch(CURRENT, { ...unchanged, ph: "", lux: "" });
    expect(diff.patch).toEqual({ medium_ph: null, light_intensity_lux: null });
    expect(diff.luxReading).toBeNull();
  });

  it("clearing an already-null field is not a change", () => {
    const diff = buildBedProfilePatch(
      { ...CURRENT, medium_ph: null },
      { ...unchanged, ph: "" },
    );
    expect(diff.patch).toEqual({});
  });

  it("select values pass through verbatim (stored strings)", () => {
    const diff = buildBedProfilePatch(CURRENT, {
      ...unchanged,
      waterMovement: "Recirculating",
      nutrientSource: "Organic Breakdown",
    });
    expect(diff.patch).toEqual({
      water_movement: "Recirculating",
      nutrient_source: "Organic Breakdown",
    });
  });

  it("clearing a select nulls it; leaving an unset select alone does not", () => {
    const cleared = buildBedProfilePatch(CURRENT, { ...unchanged, waterMovement: "" });
    expect(cleared.patch).toEqual({ water_movement: null });
    const untouched = buildBedProfilePatch(CURRENT, { ...unchanged, nutrientSource: "" });
    expect(untouched.patch).toEqual({});
  });
});
