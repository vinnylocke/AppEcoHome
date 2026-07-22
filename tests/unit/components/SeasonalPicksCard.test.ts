// SeasonalPicksCard quick-add (2026-07-22) — the "Add planting tasks" button on
// each tile. Keeps the real card + tile + task-assembly (seasonalPickPlantingTasks)
// and mocks only I/O, so it verifies the wiring: tap → ensure the plant → assemble
// the planting-journey tasks → open AddToCalendarSheet with them. Prefers a
// cached grow guide's tasks, else pick-derived + background guide gen.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const {
  fetchPicksMock, ensureMock, guideMaybeSingleMock, generateGuideMock, toastMock,
} = vi.hoisted(() => ({
  fetchPicksMock: vi.fn(),
  ensureMock: vi.fn(),
  guideMaybeSingleMock: vi.fn(),
  generateGuideMock: vi.fn(),
  toastMock: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../../src/components/shared/FeatureGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../../src/services/seasonalPicksService", () => ({
  fetchSeasonalPicks: fetchPicksMock,
}));
vi.mock("../../../src/lib/plantCatalogue", () => ({
  ensureCataloguePlantFromSearchResult: ensureMock,
}));
vi.mock("../../../src/services/plantDoctorService", () => ({
  PlantDoctorService: { generateGrowGuide: generateGuideMock },
}));
vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: guideMaybeSingleMock }) }) }),
  },
}));
vi.mock("../../../src/lib/wikipedia", () => ({ getPlantWikiInfo: vi.fn().mockResolvedValue(null) }));
vi.mock("../../../src/components/PlantDetailModal", () => ({ default: () => null }));
vi.mock("../../../src/components/growGuide/AddToCalendarSheet", () => ({
  default: ({ open, plantName, schedulableTasks }: any) =>
    open
      ? React.createElement(
          "div",
          { "data-testid": "mock-add-sheet" },
          React.createElement("span", { "data-testid": "mock-add-plant" }, plantName),
          ...(schedulableTasks || []).map((t: any, i: number) =>
            React.createElement("span", { key: i, "data-testid": `mock-task-${i}` }, `${t.task_type}:${t.title}`),
          ),
        )
      : null,
}));
vi.mock("react-hot-toast", () => ({ default: toastMock }));
vi.mock("../../../src/lib/errorHandler", () => ({ Logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("../../../src/events/registry", () => ({
  logEvent: vi.fn(),
  EVENT: new Proxy({}, { get: (_t, p) => String(p) }),
}));

import SeasonalPicksCard from "../../../src/components/seasonal/SeasonalPicksCard";

const PICK = {
  common_name: "Tomato",
  scientific_name: "Solanum lycopersicum",
  sow_method: "direct",
  sow_window_start: "2026-07-01",
  sow_window_end: "2026-08-15",
  harvest_window: { start: "2026-09-15", end: "2026-10-30" },
  reasoning: "Warm soil now.",
  effort: "easy",
  sun: ["full_sun"],
  edible: true,
};

function picksPayload(over: Record<string, unknown> = {}) {
  return {
    week_iso: "2026-W30",
    source: "ai",
    generated_at: "2026-07-20T00:00:00Z",
    from_cache: false,
    picks: [{ ...PICK, ...over }],
  };
}

function guideWith(sections: any[]) {
  return { data: { guide_data: { schema_version: 1, generated_at: "2026-01-01T00:00:00Z", sections } } };
}

function section(category: string, task: { title: string; task_type: string }) {
  return {
    category, applicable: true, title: "", summary: "", key_facts: [], steps: [], tips: [], notes: null,
    schedulable_tasks: [{
      title: task.title, description: "d", task_type: task.task_type, is_recurring: false,
      frequency_days: null, active_months: ["Mar"], duration_days: null, priority: "Medium", depends_on_index: null,
    }],
  };
}

function renderCard() {
  return render(
    React.createElement(SeasonalPicksCard, {
      homeId: "home-1", aiEnabled: true, isPremium: true, variant: "dashboard",
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchPicksMock.mockResolvedValue(picksPayload());
  // generateGrowGuide is fired-and-forgotten with `.catch(...)`, so it must
  // return a promise even in the tests that don't assert on it.
  generateGuideMock.mockResolvedValue({});
});

describe("SeasonalPicksCard — quick-add planting tasks", () => {
  test("no guide → pick-derived sow + harvest tasks, guide generated in the background", async () => {
    ensureMock.mockResolvedValue({ plantId: 5 });
    guideMaybeSingleMock.mockResolvedValue({ data: null });

    renderCard();
    fireEvent.click(await screen.findByTestId("seasonal-pick-add-0"));

    const sheet = await screen.findByTestId("mock-add-sheet");
    expect(sheet).toBeTruthy();
    expect(screen.getByTestId("mock-add-plant").textContent).toBe("Tomato");
    expect(screen.getByTestId("mock-task-0").textContent).toBe("Planting:Direct sow Tomato");
    expect(screen.getByTestId("mock-task-1").textContent).toBe("Harvesting:Harvest Tomato");
    // Ensured the plant + kicked off background guide generation.
    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(generateGuideMock).toHaveBeenCalledWith(5, "home-1");
  });

  test("existing guide → planting-journey tasks only (ongoing care excluded), no background gen", async () => {
    ensureMock.mockResolvedValue({ plantId: 7 });
    guideMaybeSingleMock.mockResolvedValue(
      guideWith([
        section("water", { title: "Water weekly", task_type: "Watering" }),
        section("germination", { title: "Sow undercover", task_type: "Planting" }),
        section("harvesting", { title: "Pick when ripe", task_type: "Harvesting" }),
      ]),
    );

    renderCard();
    fireEvent.click(await screen.findByTestId("seasonal-pick-add-0"));

    await screen.findByTestId("mock-add-sheet");
    expect(screen.getByTestId("mock-task-0").textContent).toBe("Planting:Sow undercover");
    expect(screen.getByTestId("mock-task-1").textContent).toBe("Harvesting:Pick when ripe");
    expect(screen.queryByTestId("mock-task-2")).toBeNull(); // watering excluded
    expect(generateGuideMock).not.toHaveBeenCalled(); // guide already existed
  });

  test("a failed ensure surfaces a toast and opens no sheet", async () => {
    ensureMock.mockRejectedValue(new Error("nope"));

    renderCard();
    fireEvent.click(await screen.findByTestId("seasonal-pick-add-0"));

    // Let the rejected promise settle.
    await screen.findByTestId("seasonal-pick-add-0");
    expect(toastMock.error).toHaveBeenCalled();
    expect(screen.queryByTestId("mock-add-sheet")).toBeNull();
  });
});
