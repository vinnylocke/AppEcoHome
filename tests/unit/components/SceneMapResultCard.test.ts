import { describe, test, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Stub the heavy children + side-effecting deps so the test stays unit-level.
vi.mock("../../../src/components/PlantDetailModal", () => ({
  default: () => React.createElement("div", { "data-testid": "stub-detail-modal" }),
}));
vi.mock("../../../src/components/PlantInfoPanel", () => ({
  default: ({ plantName }: { plantName?: string }) =>
    React.createElement("div", { "data-testid": "stub-info-panel" }, plantName ?? ""),
}));
vi.mock("../../../src/lib/plantInfoResolver", () => ({
  resolvePlantInfo: vi.fn().mockResolvedValue({
    details: { common_name: "Basil" },
    result: { id: "ai-Basil", common_name: "Basil", _provider: "ai" },
  }),
}));
vi.mock("../../../src/lib/plantCatalogue", () => ({
  ensureCataloguePlantFromSearchResult: vi.fn(),
}));
vi.mock("../../../src/lib/saveToShed", () => ({ saveToShed: vi.fn() }));
vi.mock("../../../src/lib/supabase", () => ({ supabase: {} }));
vi.mock("../../../src/events/registry", () => ({ EVENT: { AI_IDENTIFY: "ai_identify" }, logEvent: vi.fn() }));

import SceneMapResultCard from "../../../src/components/lens/SceneMapResultCard";
import type { SceneMapResult } from "../../../src/services/plantDoctorService";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const result: SceneMapResult = {
  notes: "Two distinct herbs detected.",
  regions: [
    {
      box: [50, 50, 500, 500],
      candidates: [
        { name: "Basil", scientific_name: "Ocimum basilicum", confidence: 88 },
        { name: "Mint", confidence: 40 },
      ],
    },
    {
      box: [100, 520, 700, 950],
      candidates: [{ name: "Rosemary", scientific_name: "Salvia rosmarinus", confidence: 71 }],
    },
  ],
};

const renderCard = (r: SceneMapResult = result, onConfirm?: any) =>
  render(
    React.createElement(SceneMapResultCard, {
      imageUrl: "blob:test",
      result: r,
      homeId: "home-1",
      aiEnabled: true,
      isPremium: true,
      onConfirm,
    }),
  );

describe("SceneMapResultCard", () => {
  test("renders a box + a mapping row per region with candidate names", () => {
    renderCard();
    expect(screen.getByTestId("scene-map-box-0")).toBeTruthy();
    expect(screen.getByTestId("scene-map-box-1")).toBeTruthy();
    expect(screen.getByTestId("scene-map-region-0")).toBeTruthy();
    expect(screen.getByText("Basil")).toBeTruthy();
    expect(screen.getByText("Rosemary")).toBeTruthy();
    expect(screen.getByText("88%")).toBeTruthy();
  });

  test("confirming a region shows the confirmed selected identity", () => {
    renderCard();
    // Default selection is the top candidate (Basil).
    fireEvent.click(screen.getByTestId("scene-map-confirm-0"));
    expect(screen.getByTestId("scene-map-confirmed-0").textContent).toContain("Basil");
  });

  test("selecting a different candidate changes what gets confirmed", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("scene-map-candidate-0-1")); // pick Mint
    fireEvent.click(screen.getByTestId("scene-map-confirm-0"));
    expect(screen.getByTestId("scene-map-confirmed-0").textContent).toContain("Mint");
  });

  test("confirming fires onConfirm with the chosen name + the region's candidates", () => {
    const onConfirm = vi.fn();
    renderCard(result, onConfirm);
    fireEvent.click(screen.getByTestId("scene-map-confirm-0"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("Basil", result.regions[0].candidates);
  });

  test("checking a region reveals the Add to Shed button", () => {
    renderCard();
    expect(screen.queryByTestId("scene-map-add-to-shed")).toBeNull();
    fireEvent.click(screen.getByTestId("scene-map-check-0"));
    expect(screen.getByTestId("scene-map-add-to-shed")).toBeTruthy();
    expect(screen.getByTestId("scene-map-add-to-shed").textContent).toContain("Add 1 to Shed");
  });

  test("tapping a candidate's info opens the inline info panel", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("scene-map-info-0-0"));
    expect(screen.getByTestId("stub-info-panel")).toBeTruthy();
    expect(screen.getByTestId("scene-map-see-care-0-0")).toBeTruthy();
  });

  test("shows an empty state when no regions are returned", () => {
    renderCard({ regions: [] });
    expect(screen.getByText(/No distinct plants found/i)).toBeTruthy();
  });
});
