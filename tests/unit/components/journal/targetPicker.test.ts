import { describe, it, expect } from "vitest";
import { applyTargetToPayload } from "../../../../src/components/journal/TargetPicker";

describe("applyTargetToPayload", () => {
  it("attaches a plant target to inventory_item_id", () => {
    const out = applyTargetToPayload(
      { type: "plant", id: "plant-uuid", label: "Tomato" },
      { subject: "Sown", description: null },
    );
    expect(out.inventory_item_id).toBe("plant-uuid");
    expect(out.location_id).toBeNull();
    expect(out.area_id).toBeNull();
    expect(out.plan_id).toBeNull();
  });

  it("attaches a location target to location_id and leaves others null", () => {
    const out = applyTargetToPayload(
      { type: "location", id: "loc-uuid", label: "Back garden" },
      { subject: "Storm prep", description: null },
    );
    expect(out.location_id).toBe("loc-uuid");
    expect(out.inventory_item_id).toBeNull();
    expect(out.area_id).toBeNull();
    expect(out.plan_id).toBeNull();
  });

  it("attaches an area target to area_id and leaves others null", () => {
    const out = applyTargetToPayload(
      { type: "area", id: "area-uuid", label: "Greenhouse" },
      { subject: "Vent open", description: null },
    );
    expect(out.area_id).toBe("area-uuid");
    expect(out.inventory_item_id).toBeNull();
    expect(out.location_id).toBeNull();
    expect(out.plan_id).toBeNull();
  });

  it("attaches a plan target to plan_id and leaves others null", () => {
    const out = applyTargetToPayload(
      { type: "plan", id: "plan-uuid", label: "Spring Veg" },
      { subject: "Direction shift", description: null },
    );
    expect(out.plan_id).toBe("plan-uuid");
    expect(out.inventory_item_id).toBeNull();
    expect(out.location_id).toBeNull();
    expect(out.area_id).toBeNull();
  });

  it("leaves every target id null for an unassigned (type=none) entry", () => {
    const out = applyTargetToPayload(
      { type: "none", id: null, label: null },
      { subject: "General garden note", description: null },
    );
    expect(out.inventory_item_id).toBeNull();
    expect(out.location_id).toBeNull();
    expect(out.area_id).toBeNull();
    expect(out.plan_id).toBeNull();
  });

  it("preserves the rest of the payload untouched", () => {
    const out = applyTargetToPayload(
      { type: "plant", id: "p1", label: "X" },
      {
        subject: "Hello",
        description: "World",
        image_url: "https://example.com/x.jpg",
        task_id: null,
      },
    );
    expect(out.subject).toBe("Hello");
    expect(out.description).toBe("World");
    expect(out.image_url).toBe("https://example.com/x.jpg");
    expect(out.task_id).toBeNull();
  });
});
