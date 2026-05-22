import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { SeedPacketWithGermination } from "../../../src/services/nurseryService";

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("../../../src/hooks/useCachedShed", () => ({
  useCachedShed: () => ({
    plants: [
      { id: 1, common_name: "Tomato", scientific_name: ["Solanum lycopersicum"], is_archived: false },
      { id: 2, common_name: "Basil", scientific_name: ["Ocimum basilicum"], is_archived: false },
    ],
  }),
}));

vi.mock("../../../src/hooks/useFocusTrap", () => ({
  useFocusTrap: () => ({ current: null }),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Stub PlantSearchModal — we just need to assert it mounts when the
// CTA is tapped; the real modal is integration-tested elsewhere.
const plantSearchModalMock = vi.fn(() => null);
vi.mock("../../../src/components/PlantSearchModal", () => ({
  default: (props: any) => {
    plantSearchModalMock(props);
    return React.createElement("div", {
      "data-testid": "mock-plant-search-modal",
      "data-initial-query": props.initialSearchTerm,
      "data-is-premium": String(props.isPremium),
      "data-is-ai-enabled": String(props.isAiEnabled),
    });
  },
}));

import EditSeedPacketModal from "../../../src/components/nursery/EditSeedPacketModal";

// ── Fixtures ────────────────────────────────────────────────────────────────

const packet: SeedPacketWithGermination = {
  id: "packet-1",
  home_id: "home-1",
  plant_id: null,
  variety: "Sungold",
  vendor: null,
  purchased_on: null,
  opened_on: null,
  sow_by: null,
  quantity_remaining: null,
  notes: null,
  is_archived: false,
  image_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  latest_germination_observed_on: null,
  latest_germination_rate_pct: null,
  latest_germination_sample_size: null,
  active_sowing_id: null,
  active_sowing_status: null,
  active_sowing_sown_count: null,
};

function renderModal(overrides: Partial<React.ComponentProps<typeof EditSeedPacketModal>> = {}) {
  return render(
    React.createElement(EditSeedPacketModal, {
      homeId: "home-1",
      packet,
      plant: null,
      aiEnabled: true,
      perenualEnabled: true,
      focusLink: true,
      onClose: () => {},
      onSaved: () => {},
      ...overrides,
    }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("EditSeedPacketModal — provider search CTA", () => {
  beforeEach(() => {
    plantSearchModalMock.mockClear();
  });

  test("CTA renders when the Shed search section is open", () => {
    renderModal();
    expect(screen.getByTestId("edit-packet-provider-search")).toBeTruthy();
  });

  test("tapping the CTA mounts PlantSearchModal pre-filled with the packet variety", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("edit-packet-provider-search"));
    const search = screen.getByTestId("mock-plant-search-modal");
    expect(search).toBeTruthy();
    // No Shed-search text yet, so falls back to the variety
    expect(search.getAttribute("data-initial-query")).toBe("Sungold");
  });

  test("CTA forwards aiEnabled + perenualEnabled to PlantSearchModal", () => {
    renderModal({ aiEnabled: false, perenualEnabled: false });
    fireEvent.click(screen.getByTestId("edit-packet-provider-search"));
    const search = screen.getByTestId("mock-plant-search-modal");
    expect(search.getAttribute("data-is-ai-enabled")).toBe("false");
    expect(search.getAttribute("data-is-premium")).toBe("false");
  });

  test("typing in the Shed search overrides the initial query passed to the provider search", () => {
    renderModal();
    const shedSearch = screen.getByTestId("edit-packet-shed-search") as HTMLInputElement;
    fireEvent.change(shedSearch, { target: { value: "Eggplant" } });
    fireEvent.click(screen.getByTestId("edit-packet-provider-search"));
    expect(
      screen.getByTestId("mock-plant-search-modal").getAttribute("data-initial-query"),
    ).toBe("Eggplant");
  });
});
