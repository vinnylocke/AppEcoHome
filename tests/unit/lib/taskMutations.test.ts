import { describe, test, expect, vi } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

import { buildGhostPayload } from "../../../src/lib/taskMutations";

// A ghost as taskEngine builds it from a blueprint — carries the blueprint's
// ownership/visibility fields.
function ghost(over: Record<string, unknown> = {}) {
  return {
    home_id: "home-1",
    blueprint_id: "bp-1",
    title: "Water the beds",
    description: "desc",
    type: "Watering",
    due_date: "2026-07-02",
    location_id: "loc-1",
    area_id: "area-1",
    plan_id: "plan-9",
    inventory_item_ids: ["item-1"],
    window_end_date: null,
    next_check_at: null,
    scope: "personal",
    created_by: "user-7",
    assigned_to: "user-8",
    ...over,
  };
}

describe("buildGhostPayload — ownership/visibility passthrough (bug-audit-2026-07-10 #5)", () => {
  test("carries scope, created_by, assigned_to, plan_id from the ghost", () => {
    const payload = buildGhostPayload(ghost(), "Pending");
    expect(payload).toMatchObject({
      scope: "personal",
      created_by: "user-7",
      assigned_to: "user-8",
      plan_id: "plan-9",
    });
  });

  test("a personal routine's materialised row is NOT silently home-scoped", () => {
    // The regression: dropping scope let the DB default it to 'home', exposing a
    // personal task to the whole home.
    const payload = buildGhostPayload(ghost({ scope: "personal" }), "Completed");
    expect(payload.scope).toBe("personal");
    expect(payload.scope).not.toBe("home");
  });

  test("defaults are safe when the ghost lacks the fields (scope→home, others→null)", () => {
    const bare = ghost();
    delete (bare as Record<string, unknown>).scope;
    delete (bare as Record<string, unknown>).created_by;
    delete (bare as Record<string, unknown>).assigned_to;
    const payload = buildGhostPayload(bare, "Pending");
    expect(payload.scope).toBe("home");
    expect(payload.created_by).toBeNull();
    expect(payload.assigned_to).toBeNull();
  });

  test("overrides still win (e.g. due_date on postpone)", () => {
    const payload = buildGhostPayload(ghost(), "Pending", { due_date: "2026-07-05" });
    expect(payload.due_date).toBe("2026-07-05");
    expect(payload.scope).toBe("personal"); // untouched by the override
  });
});
