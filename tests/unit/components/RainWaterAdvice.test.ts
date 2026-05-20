import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import RainWaterAdvice, {
  computeRainAdvice,
} from "../../../src/components/quick/RainWaterAdvice";

describe("computeRainAdvice (pure helper)", () => {
  test("skip — heavy rain + open watering tasks", () => {
    const a = computeRainAdvice({
      todayRainMm: 4,
      tomorrowRainMm: 5,
      openWateringTaskCount: 2,
    });
    expect(a.verdict).toBe("skip");
    expect(a.headline).toBe("Skip watering today");
    expect(a.body).toContain("9mm");
    expect(a.body).toContain("2 watering tasks");
  });

  test("settled — heavy rain but no watering tasks scheduled", () => {
    const a = computeRainAdvice({
      todayRainMm: 6,
      tomorrowRainMm: 2,
      openWateringTaskCount: 0,
    });
    expect(a.verdict).toBe("settled");
    expect(a.headline).toBe("Rain's got it covered");
    expect(a.body).toContain("8mm");
  });

  test("water — almost no rain + open watering tasks", () => {
    const a = computeRainAdvice({
      todayRainMm: 0,
      tomorrowRainMm: 0.4,
      openWateringTaskCount: 1,
    });
    expect(a.verdict).toBe("water");
    expect(a.headline).toBe("Water today");
    expect(a.body).toContain("0.4mm");
    expect(a.body).toContain("1 watering task");
  });

  test("info — middling rain with no urgent skew", () => {
    const a = computeRainAdvice({
      todayRainMm: 2,
      tomorrowRainMm: 1,
      openWateringTaskCount: 0,
    });
    expect(a.verdict).toBe("info");
    expect(a.headline).toBe("3mm forecast");
    expect(a.body).toContain("No watering scheduled");
  });

  test("respects custom thresholds — narrower skip threshold triggers earlier", () => {
    const a = computeRainAdvice({
      todayRainMm: 2,
      tomorrowRainMm: 1,
      openWateringTaskCount: 1,
      rainSkipMm: 2,
      rainWaterMm: 0.5,
    });
    expect(a.verdict).toBe("skip");
  });

  test("singular task wording when openWateringTaskCount === 1", () => {
    const a = computeRainAdvice({
      todayRainMm: 6,
      tomorrowRainMm: 0,
      openWateringTaskCount: 1,
    });
    expect(a.body).toContain("1 watering task");
    expect(a.body).not.toContain("1 watering tasks");
  });

  test("rounds totalRain to 1 decimal place", () => {
    const a = computeRainAdvice({
      todayRainMm: 0.123,
      tomorrowRainMm: 0.456,
      openWateringTaskCount: 0,
    });
    // 0.123 + 0.456 = 0.579 → rounded to 0.6
    expect(a.headline).toBe("0.6mm forecast");
  });
});

describe("RainWaterAdvice (rendering)", () => {
  test("renders headline + body for skip verdict", () => {
    render(
      React.createElement(RainWaterAdvice, {
        todayRainMm: 8,
        tomorrowRainMm: 0,
        openWateringTaskCount: 3,
      }),
    );
    const wrapper = screen.getByTestId("rain-water-advice");
    expect(wrapper.getAttribute("data-verdict")).toBe("skip");
    expect(screen.getByTestId("rain-water-advice-headline").textContent).toBe(
      "Skip watering today",
    );
    expect(screen.getByTestId("rain-water-advice-body").textContent).toContain(
      "8mm",
    );
  });

  test("renders water verdict with amber styling cue", () => {
    render(
      React.createElement(RainWaterAdvice, {
        todayRainMm: 0,
        tomorrowRainMm: 0,
        openWateringTaskCount: 2,
      }),
    );
    expect(
      screen.getByTestId("rain-water-advice").getAttribute("data-verdict"),
    ).toBe("water");
  });
});
