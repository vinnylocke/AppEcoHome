import { describe, it, expect } from "vitest";
import { scopeDevicesToArea } from "../../../src/lib/automationDeviceScope";

const devices = [
  { id: "a", name: "Bed A sensor", area_id: "area-1" },
  { id: "b", name: "Bed B sensor", area_id: "area-2" },
  { id: "c", name: "Unassigned", area_id: null },
];

describe("scopeDevicesToArea", () => {
  it("returns all devices when no area is set", () => {
    expect(scopeDevicesToArea(devices, null).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("filters to devices in the area", () => {
    expect(scopeDevicesToArea(devices, "area-1").map((d) => d.id)).toEqual(["a"]);
  });

  it("always keeps already-selected devices even if outside the area", () => {
    expect(scopeDevicesToArea(devices, "area-1", ["b"]).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("does not duplicate a selected device already in the area", () => {
    expect(scopeDevicesToArea(devices, "area-1", ["a"]).map((d) => d.id)).toEqual(["a"]);
  });
});
