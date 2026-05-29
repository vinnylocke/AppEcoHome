import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

import PlantDoctorHistory from "../../../src/components/PlantDoctorHistory";
import type { PlantDoctorSession } from "../../../src/hooks/usePlantDoctorSessions";

const sceneSession: PlantDoctorSession = {
  id: "s1",
  user_id: "u1",
  home_id: "h1",
  action: "scene",
  image_path: "u1/s1.jpg",
  imageUrl: "blob:scene",
  results: {
    notes: "Two herbs.",
    regions: [
      { box: [10, 10, 500, 500], candidates: [{ name: "Basil", confidence: 88 }, { name: "Mint", confidence: 40 }] },
      { box: [100, 520, 700, 950], candidates: [{ name: "Rosemary", confidence: 71 }] },
    ],
    confirmed: { "0": "Basil" },
  },
  confirmed_value: null,
  confirmed_at: null,
  created_at: new Date().toISOString(),
};

describe("PlantDoctorHistory — Group ID (scene) sessions", () => {
  test("renders a Group ID card with a detected-plant summary", () => {
    render(React.createElement(PlantDoctorHistory, { sessions: [sceneSession], isLoading: false, onLoad: vi.fn() }));
    const card = screen.getByTestId("doctor-history-card-s1");
    // Badge in the card.
    expect(within(card).getByText("Group ID")).toBeTruthy();
    // Summary line lists the detected plants.
    expect(within(card).getByText(/2 plants/)).toBeTruthy();
  });

  test("drills down to per-plant rows on expand", () => {
    render(React.createElement(PlantDoctorHistory, { sessions: [sceneSession], isLoading: false, onLoad: vi.fn() }));
    const card = screen.getByTestId("doctor-history-card-s1");
    fireEvent.click(within(card).getAllByRole("button")[0]); // header toggle
    expect(screen.getByTestId("doctor-history-scene-plants")).toBeTruthy();
    expect(screen.getByTestId("doctor-history-scene-plant-0")).toBeTruthy();
    expect(screen.getByTestId("doctor-history-scene-plant-1")).toBeTruthy();
    // "Mint" (region 0's second candidate) only appears once the card is expanded.
    expect(screen.getByText("Mint")).toBeTruthy();
  });

  test("exposes a Group ID action filter", () => {
    render(React.createElement(PlantDoctorHistory, { sessions: [sceneSession], isLoading: false, onLoad: vi.fn() }));
    expect(screen.getByTestId("doctor-history-filter-scene")).toBeTruthy();
  });
});
