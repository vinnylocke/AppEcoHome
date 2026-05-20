import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Stub child components so we can assert composition without exercising
// their internals (each has its own dedicated spec).
vi.mock("../../../src/components/quick/PlantingCalendarCard", () => ({
  default: ({ homeId, aiEnabled }: { homeId: string; aiEnabled: boolean }) =>
    React.createElement(
      "div",
      {
        "data-testid": "stub-planting-card",
        "data-home-id": homeId,
        "data-ai-enabled": String(aiEnabled),
      },
      "planting",
    ),
}));

vi.mock("../../../src/components/quick/RainWaterAdvice", () => ({
  default: ({
    todayRainMm,
    tomorrowRainMm,
    openWateringTaskCount,
    rainSkipMm,
    rainWaterMm,
  }: {
    todayRainMm: number;
    tomorrowRainMm: number;
    openWateringTaskCount: number;
    rainSkipMm: number;
    rainWaterMm: number;
  }) =>
    React.createElement(
      "div",
      {
        "data-testid": "stub-rain-advice",
        "data-today": String(todayRainMm),
        "data-tomorrow": String(tomorrowRainMm),
        "data-tasks": String(openWateringTaskCount),
        "data-skip": String(rainSkipMm),
        "data-water": String(rainWaterMm),
      },
      "rain advice",
    ),
}));

vi.mock("../../../src/components/TaskList", () => ({
  default: ({ compact, targetDate }: { compact?: boolean; targetDate?: Date }) =>
    React.createElement(
      "div",
      {
        "data-testid": "stub-task-list",
        "data-compact": String(!!compact),
        "data-target-date": targetDate?.toDateString() ?? "",
      },
      "task list",
    ),
}));

// Mock react-router useNavigate.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

// Mock supabase to return shaped data.
const { weatherDataMock, climateDataMock, taskCountMock } = vi.hoisted(() => ({
  weatherDataMock: { current: { precipitation_sum: 0 }, daily: { precipitation_sum: [4.2, 0.8] } },
  climateDataMock: { rain_skip_mm: 5, rain_water_mm: 1 },
  taskCountMock: 2,
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "weather_snapshots") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { data: weatherDataMock } }),
            }),
          }),
        };
      }
      if (table === "home_climate") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: climateDataMock }),
            }),
          }),
        };
      }
      if (table === "tasks") {
        // tasks query uses .select(..., { count: "exact", head: true }).eq().eq().eq().eq()
        const chain = {
          eq: () => chain as never,
          then: (resolve: (v: { count: number }) => void) =>
            Promise.resolve({ count: taskCountMock }).then(resolve),
        };
        return {
          select: () => chain,
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
    },
  },
}));

vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn(), info: vi.fn() },
}));

import LocalizedTaskCalendar from "../../../src/components/quick/LocalizedTaskCalendar";

beforeEach(() => {
  navigateMock.mockReset();
});

function renderCalendar(aiEnabled = true) {
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(LocalizedTaskCalendar, { homeId: "home-1", aiEnabled }),
    ),
  );
}

describe("LocalizedTaskCalendar", () => {
  test("renders the three cards top-to-bottom (planting → rain → tasks)", async () => {
    renderCalendar();
    expect(screen.getByTestId("stub-planting-card")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("stub-rain-advice")).toBeTruthy();
    });
    expect(screen.getByTestId("stub-task-list")).toBeTruthy();
  });

  test("passes aiEnabled prop through to PlantingCalendarCard", () => {
    renderCalendar(false);
    expect(
      screen.getByTestId("stub-planting-card").getAttribute("data-ai-enabled"),
    ).toBe("false");
  });

  test("passes weather + thresholds + task count to RainWaterAdvice", async () => {
    renderCalendar();
    await waitFor(() => screen.getByTestId("stub-rain-advice"));
    const card = screen.getByTestId("stub-rain-advice");
    expect(card.getAttribute("data-today")).toBe("4.2");
    expect(card.getAttribute("data-tomorrow")).toBe("0.8");
    expect(card.getAttribute("data-tasks")).toBe("2");
    expect(card.getAttribute("data-skip")).toBe("5");
    expect(card.getAttribute("data-water")).toBe("1");
  });

  test("TaskList is mounted in compact mode with today's date", () => {
    renderCalendar();
    const list = screen.getByTestId("stub-task-list");
    expect(list.getAttribute("data-compact")).toBe("true");
    expect(list.getAttribute("data-target-date")).toBe(new Date().toDateString());
  });

  test("back button routes to /quick", () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId("quick-calendar-back"));
    expect(navigateMock).toHaveBeenCalledWith("/quick");
  });
});
