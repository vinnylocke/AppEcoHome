import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock the service so we control responses per test.
const { lookupFrostDatesMock, plantWhenToPlantMock } = vi.hoisted(() => ({
  lookupFrostDatesMock: vi.fn(),
  plantWhenToPlantMock: vi.fn(),
}));

vi.mock("../../../src/services/plantDoctorService", () => ({
  PlantDoctorService: {
    lookupFrostDates: (...args: unknown[]) => lookupFrostDatesMock(...args),
    plantWhenToPlant: (...args: unknown[]) => plantWhenToPlantMock(...args),
  },
}));

// Mock supabase for the direct home_climate read added in Phase 1 of the
// frost-dates optimisation. Tests set `cachedRow` to control the response.
const { supabaseState } = vi.hoisted(() => ({
  supabaseState: { cachedRow: null as Record<string, unknown> | null },
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: supabaseState.cachedRow, error: null }),
        }),
      }),
    }),
  },
}));

// Stub toast so the AI-gated path can be asserted.
const { toastFn, toastErrorFn } = vi.hoisted(() => ({
  toastFn: vi.fn(),
  toastErrorFn: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(toastFn, {
    error: toastErrorFn,
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
  toast: Object.assign(toastFn, {
    error: toastErrorFn,
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Silence Logger noise.
vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn(), info: vi.fn() },
}));

import PlantingCalendarCard from "../../../src/components/quick/PlantingCalendarCard";

const FROST_RESPONSE = {
  last_frost_iso: "2026-04-12",
  first_frost_iso: "2026-10-26",
  growing_season_days: 197,
  notes: null,
  rain_skip_mm: 5,
  rain_water_mm: 1,
  from_cache: true,
};

const GUIDANCE_RESPONSE = {
  plant_name: "Tomato",
  scientific_name: "Solanum lycopersicum",
  can_plant_outdoors_now: false,
  earliest_outdoor_date: "2026-05-15",
  latest_outdoor_date: "2026-07-15",
  indoor_start_recommended: true,
  indoor_start_date: "2026-03-15",
  spacing_cm: 45,
  depth_cm: 1,
  sun_requirement: "full sun",
  tips: ["Harden off before transplanting.", "Mulch to retain moisture."],
};

beforeEach(() => {
  lookupFrostDatesMock.mockReset();
  plantWhenToPlantMock.mockReset();
  toastFn.mockReset();
  toastErrorFn.mockReset();
  // Default: no cached row → component falls back to the edge fn (mocked
  // via lookupFrostDatesMock). Individual tests override this to exercise
  // the direct-read fast path.
  supabaseState.cachedRow = null;
});

describe("PlantingCalendarCard", () => {
  test("shows loading state then frost dates after lookup resolves", async () => {
    lookupFrostDatesMock.mockResolvedValueOnce(FROST_RESPONSE);
    render(
      React.createElement(PlantingCalendarCard, {
        homeId: "home-1",
        aiEnabled: true,
      }),
    );

    expect(screen.getByText(/Looking up your frost dates/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId("planting-calendar-last-frost")).toBeTruthy();
    });

    expect(screen.getByTestId("planting-calendar-last-frost").textContent).toContain("12");
    expect(screen.getByTestId("planting-calendar-first-frost").textContent).toContain("26");
  });

  test("shows error fallback when frost lookup rejects", async () => {
    lookupFrostDatesMock.mockRejectedValueOnce(new Error("boom"));
    render(
      React.createElement(PlantingCalendarCard, {
        homeId: "home-1",
        aiEnabled: true,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("planting-calendar-frost-error")).toBeTruthy();
    });
  });

  test("submitting a plant name calls plantWhenToPlant and renders result", async () => {
    lookupFrostDatesMock.mockResolvedValueOnce(FROST_RESPONSE);
    plantWhenToPlantMock.mockResolvedValueOnce(GUIDANCE_RESPONSE);

    render(
      React.createElement(PlantingCalendarCard, {
        homeId: "home-1",
        aiEnabled: true,
      }),
    );
    await waitFor(() => screen.getByTestId("planting-calendar-last-frost"));

    fireEvent.change(screen.getByTestId("planting-calendar-input"), {
      target: { value: "tomato" },
    });
    fireEvent.click(screen.getByTestId("planting-calendar-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("planting-calendar-result")).toBeTruthy();
    });

    expect(plantWhenToPlantMock).toHaveBeenCalledWith("tomato", "home-1");
    expect(screen.getByTestId("planting-calendar-verdict").textContent).toContain("Hold off");
    expect(screen.getByText("Tomato")).toBeTruthy();
    expect(screen.getByText("Harden off before transplanting.")).toBeTruthy();
  });

  test("blocks submit on non-AI tier and shows upgrade toast", async () => {
    lookupFrostDatesMock.mockResolvedValueOnce(FROST_RESPONSE);
    render(
      React.createElement(PlantingCalendarCard, {
        homeId: "home-1",
        aiEnabled: false,
      }),
    );
    await waitFor(() => screen.getByTestId("planting-calendar-last-frost"));

    fireEvent.change(screen.getByTestId("planting-calendar-input"), {
      target: { value: "carrot" },
    });
    fireEvent.click(screen.getByTestId("planting-calendar-submit"));

    expect(plantWhenToPlantMock).not.toHaveBeenCalled();
    expect(toastErrorFn).toHaveBeenCalled();
    expect(toastErrorFn.mock.calls[0][0]).toContain("AI tier");
  });

  // ─── Direct cache-read optimisation (Phase 1) ───────────────────────────

  test("fresh cached row skips the edge fn entirely", async () => {
    // Cached row is fresh (lookup_at = now)
    supabaseState.cachedRow = {
      last_frost_iso: "2026-04-01",
      first_frost_iso: "2026-11-01",
      growing_season_days: 214,
      notes: null,
      rain_skip_mm: 5,
      rain_water_mm: 1,
      last_frost_lookup_at: new Date().toISOString(),
    };

    render(
      React.createElement(PlantingCalendarCard, {
        homeId: "home-1",
        aiEnabled: true,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("planting-calendar-last-frost")).toBeTruthy();
    });

    // The whole point: edge fn was NEVER called because the cache was fresh.
    expect(lookupFrostDatesMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("planting-calendar-last-frost").textContent).toContain(
      "1",
    );
  });

  test("stale cached row falls back to the edge fn", async () => {
    // Cached row exists but lookup_at is older than 180 days
    const oldDate = new Date(Date.now() - 200 * 864e5).toISOString();
    supabaseState.cachedRow = {
      last_frost_iso: "2025-04-01",
      first_frost_iso: "2025-11-01",
      growing_season_days: 214,
      notes: null,
      rain_skip_mm: 5,
      rain_water_mm: 1,
      last_frost_lookup_at: oldDate,
    };
    lookupFrostDatesMock.mockResolvedValueOnce(FROST_RESPONSE);

    render(
      React.createElement(PlantingCalendarCard, {
        homeId: "home-1",
        aiEnabled: true,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("planting-calendar-last-frost")).toBeTruthy();
    });

    // Falls back to edge fn for a refresh.
    expect(lookupFrostDatesMock).toHaveBeenCalledTimes(1);
  });

  test("missing cached row falls back to the edge fn", async () => {
    supabaseState.cachedRow = null;
    lookupFrostDatesMock.mockResolvedValueOnce(FROST_RESPONSE);

    render(
      React.createElement(PlantingCalendarCard, {
        homeId: "home-1",
        aiEnabled: true,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("planting-calendar-last-frost")).toBeTruthy();
    });
    expect(lookupFrostDatesMock).toHaveBeenCalledTimes(1);
  });

  test("cached row with NULL frost dates (rain-thresholds-only) falls back", async () => {
    // User saved rain thresholds in Climate Settings BEFORE the first frost
    // lookup ever ran. The row exists but frost columns are NULL.
    supabaseState.cachedRow = {
      last_frost_iso: null,
      first_frost_iso: null,
      growing_season_days: null,
      notes: null,
      rain_skip_mm: 8,
      rain_water_mm: 2,
      last_frost_lookup_at: null,
    };
    lookupFrostDatesMock.mockResolvedValueOnce(FROST_RESPONSE);

    render(
      React.createElement(PlantingCalendarCard, {
        homeId: "home-1",
        aiEnabled: true,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("planting-calendar-last-frost")).toBeTruthy();
    });
    expect(lookupFrostDatesMock).toHaveBeenCalledTimes(1);
  });
});
