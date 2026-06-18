import { describe, test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import ImageCredit from "../../../src/components/credit/ImageCredit";

// A known (non-"unknown") credit so the badge + popover render fully.
const credit = {
  provider: "unsplash",
  attribution: "Photo by Jane Doe",
  source_url: "https://unsplash.com/photos/x",
};

describe("ImageCredit / CreditPopover", () => {
  test("opens the source popover when the badge is clicked", () => {
    render(React.createElement(ImageCredit, { credit, variant: "badge-only" }));

    expect(screen.queryByTestId("image-credit-popover")).toBeNull();
    fireEvent.click(screen.getByTestId("image-credit-badge"));
    expect(screen.getByTestId("image-credit-popover")).toBeTruthy();
  });

  test("closes when the ✕ is clicked and does not re-open", () => {
    // Regression: the popover portals to <body> but is a React child of the
    // trigger button, so a click on ✕ used to bubble back to the trigger's
    // onClick and immediately re-open it. The panel now stops propagation.
    render(React.createElement(ImageCredit, { credit, variant: "badge-only" }));

    fireEvent.click(screen.getByTestId("image-credit-badge"));
    expect(screen.getByTestId("image-credit-popover")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Close credit"));
    expect(screen.queryByTestId("image-credit-popover")).toBeNull();
  });
});
