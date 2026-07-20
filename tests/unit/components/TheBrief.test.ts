// The Brief (redesign Stage 3) — the four AI cards merged into one
// "From Rhozly" card. These tests stub the four children and exercise the
// composition contract that lives in TheBrief itself:
//  - the card shows while any child reports content (defaults TRUE pre-report)
//  - the card hides when every child reports empty
//  - a gated child that never reports (locked account — its inner never
//    mounts) keeps the card visible, because the gate fallback is the nudge
//  - the upgrade dedup wiring: AssistantCard gets showUpgradeWhenLocked=false
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Per-row control: true → render content + report true; false → render null +
// report false; null → "gated" (render a stand-in nudge, never report — the
// real FeatureGate never mounts the inner for locked accounts).
const { rowState, receivedProps } = vi.hoisted(() => ({
  rowState: {
    brief: false as boolean | null,
    adaptive: false as boolean | null,
    estate: false as boolean | null,
    insight: false as boolean | null,
  },
  receivedProps: {
    brief: null as Record<string, unknown> | null,
    assistant: null as Record<string, unknown> | null,
  },
}));

type StubProps = { onVisibilityChange?: (v: boolean) => void } & Record<string, unknown>;

async function makeStub(
  key: "brief" | "adaptive" | "estate" | "insight",
  testid: string,
  record?: "brief" | "assistant",
) {
  const { createElement, useEffect } = await import("react");
  return function Stub(props: StubProps) {
    if (record) receivedProps[record] = props;
    const state = rowState[key];
    useEffect(() => {
      if (state !== null) props.onVisibilityChange?.(state);
    });
    if (state === null) {
      // Locked: the gate fallback (compact nudge) is real visible content.
      return createElement("div", { "data-testid": `${testid}-nudge` }, "Upgrade");
    }
    return state ? createElement("div", { "data-testid": testid }, key) : null;
  };
}

vi.mock("../../../src/components/home/GardenBrainBriefCard", async () => ({
  default: await makeStub("brief", "stub-brief", "brief"),
}));
vi.mock("../../../src/components/home/AdaptiveCareCard", async () => ({
  default: await makeStub("adaptive", "stub-adaptive"),
}));
vi.mock("../../../src/components/manager/HeadGardenerCard", async () => ({
  default: await makeStub("estate", "stub-estate"),
}));
vi.mock("../../../src/components/AssistantCard", async () => ({
  default: await makeStub("insight", "stub-insight", "assistant"),
}));

import TheBrief from "../../../src/components/home/TheBrief";

function renderBrief() {
  return render(
    React.createElement(TheBrief, {
      homeId: "home-1",
      userId: "user-1",
      density: "detailed" as const,
    }),
  );
}

beforeEach(() => {
  rowState.brief = false;
  rowState.adaptive = false;
  rowState.estate = false;
  rowState.insight = false;
  receivedProps.brief = null;
  receivedProps.assistant = null;
});

describe("TheBrief", () => {
  test("renders the From Rhozly card when a child reports content", async () => {
    rowState.brief = true;
    renderBrief();
    const root = screen.getByTestId("the-brief");
    await waitFor(() => expect(root.hidden).toBe(false));
    expect(screen.getByText(/from rhozly/i)).toBeTruthy();
    expect(screen.getByTestId("stub-brief")).toBeTruthy();
  });

  test("hides the card when every child reports empty", async () => {
    renderBrief();
    // Defaults are TRUE pre-report (no flash); once all four report false the
    // card hides via the `hidden` attribute (children stay mounted).
    await waitFor(() => expect(screen.getByTestId("the-brief").hidden).toBe(true));
  });

  test("adaptive-care content alone keeps the card visible", async () => {
    rowState.adaptive = true;
    renderBrief();
    const root = screen.getByTestId("the-brief");
    await waitFor(() => expect(screen.getByTestId("stub-adaptive")).toBeTruthy());
    expect(root.hidden).toBe(false);
  });

  test("a gated estate row that never reports keeps the card visible (locked nudge case)", async () => {
    rowState.estate = null; // inner never mounts → no report → default TRUE holds
    renderBrief();
    const root = screen.getByTestId("the-brief");
    // The other three report false; the estate default keeps the card up so
    // the single compact UpgradeNudge (the gate fallback) stays reachable.
    await waitFor(() => expect(screen.getByTestId("stub-estate-nudge")).toBeTruthy());
    expect(root.hidden).toBe(false);
  });

  test("row wrappers keep the dashboard testids inside the card", () => {
    renderBrief();
    const root = screen.getByTestId("the-brief");
    expect(root.querySelector('[data-testid="dashboard-head-gardener-card"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dashboard-assistant-card"]')).toBeTruthy();
  });

  test("upgrade dedup: AssistantCard's nudge is suppressed; the brief row is embedded", () => {
    renderBrief();
    // The estate row's FeatureGate fallback owns the ONE compact nudge —
    // AssistantCard must never double it.
    expect(receivedProps.assistant?.showUpgradeWhenLocked).toBe(false);
    expect(receivedProps.assistant?.userId).toBe("user-1");
    // Children render chrome-less inside the card.
    expect(receivedProps.brief?.embedded).toBe(true);
    expect(receivedProps.brief?.homeId).toBe("home-1");
    expect(receivedProps.brief?.density).toBe("detailed");
  });
});
