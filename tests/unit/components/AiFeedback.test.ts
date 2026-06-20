import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import AiFeedback from "../../../src/components/ai/AiFeedback";

// Render-only: the supabase write happens on click, so a plain render needs no mock.
describe("AiFeedback", () => {
  test("renders the thumbs up + down controls", () => {
    render(
      React.createElement(AiFeedback, {
        functionName: "area-sensor-analysis",
        action: "area_coach",
        targetKind: "area_insight",
        targetId: "a1",
      }),
    );
    expect(screen.getByTestId("ai-feedback")).toBeTruthy();
    expect(screen.getByTestId("ai-feedback-up")).toBeTruthy();
    expect(screen.getByTestId("ai-feedback-down")).toBeTruthy();
  });
});
