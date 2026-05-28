import { describe, it, expect } from "vitest";
import { shouldPromptForSowing } from "../../../src/services/sowingAutoCreateService";

describe("shouldPromptForSowing", () => {
  it("returns false when the task is not a Planting task", () => {
    expect(
      shouldPromptForSowing({
        id: "t1",
        title: "Water tomatoes",
        type: "Watering",
        seed_packet_id: "packet-123",
      }),
    ).toBe(false);
  });

  it("returns false when the Planting task has no seed_packet_id", () => {
    expect(
      shouldPromptForSowing({
        id: "t1",
        title: "Plant out tomato seedlings",
        type: "Planting",
        seed_packet_id: null,
      }),
    ).toBe(false);
  });

  it("returns true when a Planting task is linked to a packet", () => {
    expect(
      shouldPromptForSowing({
        id: "t1",
        title: "Sow tomato seeds",
        type: "Planting",
        seed_packet_id: "packet-123",
      }),
    ).toBe(true);
  });

  it("returns false for harvesting tasks even when linked to a packet (defensive)", () => {
    // The picker only exposes the link control for Planting tasks, but
    // the service guards against the link landing on a non-Planting type
    // via a hand-edit or migration shenanigans.
    expect(
      shouldPromptForSowing({
        id: "t1",
        title: "Harvest tomatoes",
        type: "Harvesting",
        seed_packet_id: "packet-123",
      }),
    ).toBe(false);
  });

  it("treats a null task defensively as no-prompt", () => {
    expect(shouldPromptForSowing(null as any)).toBe(false);
  });
});
