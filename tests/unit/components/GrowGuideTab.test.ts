import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Supabase mock — controls the initial cache read response.
const { supabaseState } = vi.hoisted(() => ({
  supabaseState: {
    cachedRow: null as Record<string, unknown> | null,
    queryError: null as string | null,
  },
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(
              supabaseState.queryError
                ? { data: null, error: { message: supabaseState.queryError } }
                : { data: supabaseState.cachedRow, error: null },
            ),
        }),
      }),
    }),
  },
}));

// Plant doctor service mock.
const { generateGrowGuideMock } = vi.hoisted(() => ({
  generateGrowGuideMock: vi.fn(),
}));
vi.mock("../../../src/services/plantDoctorService", () => ({
  PlantDoctorService: {
    generateGrowGuide: (...args: unknown[]) => generateGrowGuideMock(...args),
  },
}));

// Logger noise silencer.
vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn(), info: vi.fn() },
}));

// Toast spy.
const { toastSuccessFn, toastErrorFn } = vi.hoisted(() => ({
  toastSuccessFn: vi.fn(),
  toastErrorFn: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: toastSuccessFn,
    error: toastErrorFn,
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
  toast: Object.assign(vi.fn(), {
    success: toastSuccessFn,
    error: toastErrorFn,
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import GrowGuideTab from "../../../src/components/GrowGuideTab";

function makeGuidePayload() {
  return {
    schema_version: 1,
    generated_at: "2026-05-21T10:00:00Z",
    sections: [
      {
        category: "water",
        applicable: true,
        title: "Watering",
        summary: "Water deeply every few days.",
        key_facts: [{ label: "Frequency", value: "Every 3-4 days" }],
        steps: [],
        tips: ["Avoid wet leaves."],
        notes: null,
      },
      {
        category: "harvesting",
        applicable: false,
        title: "Harvesting",
        summary: "",
        key_facts: [],
        steps: [],
        tips: [],
        notes: null,
      },
      {
        category: "pruning",
        applicable: true,
        title: "Pruning",
        summary: "Prune annually.",
        key_facts: [],
        steps: [{ step: 1, title: "Cut at 45°", detail: "Above a leaf node." }],
        tips: [],
        notes: null,
      },
    ],
  };
}

beforeEach(() => {
  supabaseState.cachedRow = null;
  supabaseState.queryError = null;
  generateGrowGuideMock.mockReset();
  toastSuccessFn.mockReset();
  toastErrorFn.mockReset();
});

function renderTab(overrides?: Partial<React.ComponentProps<typeof GrowGuideTab>>) {
  return render(
    React.createElement(GrowGuideTab, {
      plantId: 42,
      commonName: "Tomato",
      source: "ai",
      homeId: "home-1",
      aiEnabled: true,
      ...overrides,
    }),
  );
}

describe("GrowGuideTab", () => {
  test("shows loading state before the cache read resolves", () => {
    renderTab();
    expect(screen.getByTestId("grow-guide-loading")).toBeTruthy();
  });

  test("shows empty state when no row exists", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId("grow-guide-empty")).toBeTruthy());
    expect(screen.getByTestId("grow-guide-generate")).toBeTruthy();
  });

  test("non-AI tier shows upgrade prompt instead of Generate button", async () => {
    renderTab({ aiEnabled: false });
    await waitFor(() => expect(screen.getByTestId("grow-guide-empty")).toBeTruthy());
    expect(screen.queryByTestId("grow-guide-generate")).toBeNull();
    expect(screen.getByText(/Upgrade to an AI tier/i)).toBeTruthy();
  });

  test("manual plant empty state shows the manual hint", async () => {
    renderTab({ source: "manual" });
    await waitFor(() => expect(screen.getByTestId("grow-guide-empty")).toBeTruthy());
    expect(screen.getByTestId("grow-guide-manual-hint")).toBeTruthy();
  });

  test("clicking Generate calls the service with forceRegen false and loads the guide", async () => {
    generateGrowGuideMock.mockResolvedValueOnce({
      guide_data: makeGuidePayload(),
      schema_version: 1,
      freshness_version: 1,
      last_generated_at: new Date().toISOString(),
      updated_fields: [],
      from_cache: false,
    });

    renderTab();
    await waitFor(() => screen.getByTestId("grow-guide-empty"));
    fireEvent.click(screen.getByTestId("grow-guide-generate"));

    await waitFor(() => screen.getByTestId("grow-guide-loaded"));
    expect(generateGrowGuideMock).toHaveBeenCalledWith(42, "home-1", { forceRegen: false });
    expect(toastSuccessFn).toHaveBeenCalled();
  });

  test("loaded state renders only applicable sections", async () => {
    supabaseState.cachedRow = {
      guide_data: makeGuidePayload(),
      last_generated_at: new Date().toISOString(),
      freshness_version: 1,
    };

    renderTab();
    await waitFor(() => screen.getByTestId("grow-guide-loaded"));

    // Water (applicable) + Pruning (applicable) render; Harvesting (not applicable) does NOT.
    expect(screen.getByTestId("guide-section-water")).toBeTruthy();
    expect(screen.getByTestId("guide-section-pruning")).toBeTruthy();
    expect(screen.queryByTestId("guide-section-harvesting")).toBeNull();
  });

  test("Refresh button calls the service with forceRegen true", async () => {
    supabaseState.cachedRow = {
      guide_data: makeGuidePayload(),
      last_generated_at: new Date().toISOString(),
      freshness_version: 1,
    };
    generateGrowGuideMock.mockResolvedValueOnce({
      guide_data: makeGuidePayload(),
      schema_version: 1,
      freshness_version: 2,
      last_generated_at: new Date().toISOString(),
      updated_fields: ["water"],
      from_cache: false,
    });

    renderTab();
    await waitFor(() => screen.getByTestId("grow-guide-refresh"));
    fireEvent.click(screen.getByTestId("grow-guide-refresh"));

    await waitFor(() =>
      expect(generateGrowGuideMock).toHaveBeenCalledWith(42, "home-1", { forceRegen: true }),
    );
    expect(toastSuccessFn).toHaveBeenCalledWith(
      expect.stringContaining("1 section updated"),
    );
  });

  test("stale (>90 days old) loaded guide shows a 'may be out of date' indicator", async () => {
    const oldDate = new Date(Date.now() - 100 * 864e5).toISOString();
    supabaseState.cachedRow = {
      guide_data: makeGuidePayload(),
      last_generated_at: oldDate,
      freshness_version: 1,
    };
    renderTab();
    await waitFor(() => screen.getByTestId("grow-guide-loaded"));
    expect(screen.getByText(/may be out of date/i)).toBeTruthy();
  });

  test("Refresh button hidden when aiEnabled is false (on a loaded guide)", async () => {
    supabaseState.cachedRow = {
      guide_data: makeGuidePayload(),
      last_generated_at: new Date().toISOString(),
      freshness_version: 1,
    };
    renderTab({ aiEnabled: false });
    await waitFor(() => screen.getByTestId("grow-guide-loaded"));
    expect(screen.queryByTestId("grow-guide-refresh")).toBeNull();
  });

  test("error state from the cache query surfaces a Retry button", async () => {
    supabaseState.queryError = "RLS denied";
    renderTab();
    await waitFor(() => expect(screen.getByTestId("grow-guide-error")).toBeTruthy());
    expect(screen.getByTestId("grow-guide-retry")).toBeTruthy();
  });

  test("generate failure shows an error banner without losing existing data", async () => {
    supabaseState.cachedRow = {
      guide_data: makeGuidePayload(),
      last_generated_at: new Date().toISOString(),
      freshness_version: 1,
    };
    generateGrowGuideMock.mockRejectedValueOnce(new Error("Rate limited"));

    renderTab();
    await waitFor(() => screen.getByTestId("grow-guide-refresh"));
    fireEvent.click(screen.getByTestId("grow-guide-refresh"));

    await waitFor(() => screen.getByTestId("grow-guide-error-banner"));
    // Still in the loaded state — existing data preserved.
    expect(screen.getByTestId("grow-guide-loaded")).toBeTruthy();
  });
});
