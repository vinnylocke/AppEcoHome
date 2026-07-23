import { describe, it, expect } from "vitest";
import { buildSoilChips, SOIL_READING_STALE_MS } from "../../../src/lib/soilReadings";

// Fixed "now" so staleness is deterministic.
const NOW = Date.parse("2026-07-23T12:00:00Z");
const oneHourAgo = "2026-07-23T11:00:00Z"; // fresh
const twoDaysAgo = "2026-07-21T12:00:00Z"; // stale (> 24h)

describe("buildSoilChips", () => {
  it("returns no chips when the area has no readings", () => {
    expect(buildSoilChips({}, NOW)).toEqual([]);
    expect(
      buildSoilChips(
        {
          latest_soil_moisture_pct: null,
          latest_soil_temp_c: null,
          latest_soil_ec: null,
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("emits one chip per present metric, in moisture → temp → ec order", () => {
    const chips = buildSoilChips(
      {
        latest_soil_moisture_pct: 45,
        latest_soil_moisture_recorded_at: oneHourAgo,
        latest_soil_temp_c: 18.5,
        latest_soil_temp_recorded_at: oneHourAgo,
        latest_soil_ec: 1240,
        latest_soil_ec_recorded_at: oneHourAgo,
      },
      NOW,
    );
    expect(chips.map((c) => c.key)).toEqual(["moisture", "temp", "ec"]);
    expect(chips.map((c) => c.label)).toEqual(["45%", "18.5°C", "1240 µS/cm"]);
    expect(chips.every((c) => c.stale === false)).toBe(true);
  });

  it("skips a metric whose value is missing but keeps the others", () => {
    const chips = buildSoilChips(
      {
        latest_soil_moisture_pct: 30,
        latest_soil_moisture_recorded_at: oneHourAgo,
        latest_soil_ec: 900,
        latest_soil_ec_recorded_at: oneHourAgo,
      },
      NOW,
    );
    expect(chips.map((c) => c.key)).toEqual(["moisture", "ec"]);
  });

  it("rounds moisture and EC to integers and temp to one decimal", () => {
    const chips = buildSoilChips(
      {
        latest_soil_moisture_pct: 45.7,
        latest_soil_moisture_recorded_at: oneHourAgo,
        latest_soil_temp_c: 18.54,
        latest_soil_temp_recorded_at: oneHourAgo,
        latest_soil_ec: 1239.6,
        latest_soil_ec_recorded_at: oneHourAgo,
      },
      NOW,
    );
    expect(chips.map((c) => c.label)).toEqual(["46%", "18.5°C", "1240 µS/cm"]);
  });

  it("marks a reading older than 24h as stale", () => {
    const [chip] = buildSoilChips(
      { latest_soil_moisture_pct: 50, latest_soil_moisture_recorded_at: twoDaysAgo },
      NOW,
    );
    expect(chip.stale).toBe(true);
  });

  it("marks a reading with no timestamp as stale", () => {
    const [chip] = buildSoilChips({ latest_soil_moisture_pct: 50 }, NOW);
    expect(chip.stale).toBe(true);
    expect(chip.recordedAt).toBeNull();
  });

  it("marks a reading with an unparseable timestamp as stale", () => {
    const [chip] = buildSoilChips(
      { latest_soil_moisture_pct: 50, latest_soil_moisture_recorded_at: "not-a-date" },
      NOW,
    );
    expect(chip.stale).toBe(true);
  });

  it("treats a reading exactly at the stale boundary as fresh", () => {
    const boundary = new Date(NOW - SOIL_READING_STALE_MS + 1000).toISOString();
    const [chip] = buildSoilChips(
      { latest_soil_moisture_pct: 50, latest_soil_moisture_recorded_at: boundary },
      NOW,
    );
    expect(chip.stale).toBe(false);
  });
});
