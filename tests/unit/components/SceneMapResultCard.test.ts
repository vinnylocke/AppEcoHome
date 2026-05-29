import { describe, test, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import SceneMapResultCard from "../../../src/components/lens/SceneMapResultCard";
import type { SceneMapResult } from "../../../src/services/plantDoctorService";

// jsdom doesn't implement scrollIntoView (used to keep the active mapping row
// in view). Stub it so the active-region effect doesn't throw under test.
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

describe("SceneMapResultCard", () => {
  test("renders a box + a mapping row per region with candidate names", () => {
    render(
      React.createElement(SceneMapResultCard, { imageUrl: "blob:test", result }),
    );
    expect(screen.getByTestId("scene-map-box-0")).toBeTruthy();
    expect(screen.getByTestId("scene-map-box-1")).toBeTruthy();
    expect(screen.getByTestId("scene-map-region-0")).toBeTruthy();
    expect(screen.getByTestId("scene-map-region-1")).toBeTruthy();
    expect(screen.getByText("Basil")).toBeTruthy();
    expect(screen.getByText("Rosemary")).toBeTruthy();
    expect(screen.getByText("88%")).toBeTruthy();
  });

  test("tapping a box marks the matching region active (aria-pressed)", () => {
    render(
      React.createElement(SceneMapResultCard, { imageUrl: "blob:test", result }),
    );
    const box = screen.getByTestId("scene-map-box-0");
    expect(box.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(box);
    expect(box.getAttribute("aria-pressed")).toBe("true");
  });

  test("shows an empty state when no regions are returned", () => {
    render(
      React.createElement(SceneMapResultCard, {
        imageUrl: "blob:test",
        result: { regions: [] },
      }),
    );
    expect(screen.getByText(/No distinct plants found/i)).toBeTruthy();
  });
});
