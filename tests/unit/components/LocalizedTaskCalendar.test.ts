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

// TaskList stub also captures the key it was rendered with so we can assert
// the parent forces a remount after a Quick Add save.
let taskListRenderCount = 0;
vi.mock("../../../src/components/TaskList", () => ({
  default: ({ compact, targetDate }: { compact?: boolean; targetDate?: Date }) => {
    taskListRenderCount++;
    return React.createElement(
      "div",
      {
        "data-testid": "stub-task-list",
        "data-compact": String(!!compact),
        "data-target-date": targetDate?.toDateString() ?? "",
      },
      "task list",
    );
  },
}));

// Permissions hook — default to allowing tasks.create_home.
const permissionMock = vi.fn<(key: string) => boolean>(() => true);
vi.mock("../../../src/context/HomePermissionsContext", () => ({
  usePermissions: () => ({ can: (key: string) => permissionMock(key) }),
}));

// QuickAddTaskModal stub so we can confirm it mounts + fire onSuccess.
vi.mock("../../../src/components/quick/QuickAddTaskModal", () => ({
  default: ({
    onSuccess,
    onClose,
  }: {
    onSuccess: () => void;
    onClose: () => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "stub-quick-add-modal" },
      React.createElement(
        "button",
        { type: "button", "data-testid": "stub-quick-add-success", onClick: onSuccess },
        "fake save",
      ),
      React.createElement(
        "button",
        { type: "button", "data-testid": "stub-quick-add-close", onClick: onClose },
        "fake close",
      ),
    ),
}));

// Stub SeasonalPicksCard — its internals are tested separately and pulling in
// the real one would mount heavy dependencies (plant detail modal, etc.).
vi.mock("../../../src/components/seasonal/SeasonalPicksCard", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "stub-seasonal-picks" }, "seasonal"),
}));

// Stub AddToDoListModal — confirm it mounts on List button press.
vi.mock("../../../src/components/todo/AddToDoListModal", () => ({
  default: ({ onClose }: { onClose: () => void }) =>
    React.createElement(
      "div",
      { "data-testid": "stub-add-todo-modal" },
      React.createElement(
        "button",
        { type: "button", "data-testid": "stub-add-todo-close", onClick: onClose },
        "fake close",
      ),
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
  permissionMock.mockReset();
  permissionMock.mockReturnValue(true);
  taskListRenderCount = 0;
});

function renderCalendar(aiEnabled = true, isPremium = true) {
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(LocalizedTaskCalendar, { homeId: "home-1", aiEnabled, isPremium }),
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
    renderCalendar(false, true);
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

  test("Add button is enabled when the user has tasks.create_home", () => {
    permissionMock.mockReturnValue(true);
    renderCalendar();
    const btn = screen.getByTestId("quick-calendar-add-task") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });

  test("Add button is disabled when the user lacks tasks.create_home", () => {
    permissionMock.mockReturnValue(false);
    renderCalendar();
    const btn = screen.getByTestId("quick-calendar-add-task") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test("tapping Add opens the QuickAddTaskModal", () => {
    renderCalendar();
    expect(screen.queryByTestId("stub-quick-add-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("quick-calendar-add-task"));
    expect(screen.getByTestId("stub-quick-add-modal")).toBeTruthy();
  });

  test("modal onSuccess increments the refresh key, remounting TaskList", async () => {
    renderCalendar();
    const before = taskListRenderCount;
    fireEvent.click(screen.getByTestId("quick-calendar-add-task"));
    fireEvent.click(screen.getByTestId("stub-quick-add-success"));
    // React batches state; let it flush.
    await waitFor(() => expect(taskListRenderCount).toBeGreaterThan(before));
  });

  test("modal onClose hides the modal without remounting TaskList", () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId("quick-calendar-add-task"));
    expect(screen.getByTestId("stub-quick-add-modal")).toBeTruthy();
    fireEvent.click(screen.getByTestId("stub-quick-add-close"));
    expect(screen.queryByTestId("stub-quick-add-modal")).toBeNull();
  });
});
