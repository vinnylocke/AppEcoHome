import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import ContentFeedback from "../../../src/components/feedback/ContentFeedback";

// Render-only: the supabase write happens on click, so a plain render needs no mock.
describe("ContentFeedback", () => {
  test("renders the thumbs up + down controls with the default prompt", () => {
    render(
      React.createElement(ContentFeedback, {
        surface: "rhozly-guide",
        targetKind: "guide",
        targetId: "g1",
        targetLabel: "Getting Started",
      }),
    );
    expect(screen.getByTestId("content-feedback")).toBeTruthy();
    expect(screen.getByTestId("content-feedback-up")).toBeTruthy();
    expect(screen.getByTestId("content-feedback-down")).toBeTruthy();
    expect(screen.getByText("Was this helpful?")).toBeTruthy();
  });

  test("renders a custom prompt label", () => {
    render(
      React.createElement(ContentFeedback, {
        surface: "app-help",
        targetKind: "answer",
        label: "Did this answer your question?",
      }),
    );
    expect(screen.getByText("Did this answer your question?")).toBeTruthy();
    expect(screen.queryByText("Was this helpful?")).toBeNull();
  });
});
