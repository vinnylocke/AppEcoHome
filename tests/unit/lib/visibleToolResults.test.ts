import { describe, it, expect } from "vitest";
import { visibleToolResults, DISPLAY_ONLY_TOOLS } from "../../../src/lib/visibleToolResults";

describe("visibleToolResults", () => {
  it("drops display-only tools (show_plant_images)", () => {
    const input = [
      { tool: "list_plants", summary: "" },
      { tool: "show_plant_images", summary: "" },
      { tool: "get_weather_now", summary: "" },
    ];
    expect(visibleToolResults(input).map((r) => r.tool)).toEqual([
      "list_plants",
      "get_weather_now",
    ]);
  });

  it("passes normal read tools through unchanged", () => {
    const input = [{ tool: "list_tasks" }, { tool: "search_plant_database" }];
    expect(visibleToolResults(input)).toEqual(input);
  });

  it("returns [] for null / undefined / non-array", () => {
    expect(visibleToolResults(null)).toEqual([]);
    expect(visibleToolResults(undefined)).toEqual([]);
    // @ts-expect-error — guard against bad runtime input
    expect(visibleToolResults("nope")).toEqual([]);
  });

  it("returns [] when every result is display-only", () => {
    expect(visibleToolResults([{ tool: "show_plant_images" }])).toEqual([]);
  });

  it("exposes show_plant_images as a known display-only tool", () => {
    expect(DISPLAY_ONLY_TOOLS.has("show_plant_images")).toBe(true);
  });
});
