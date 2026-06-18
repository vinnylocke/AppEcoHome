import { describe, it, expect } from "vitest";
import { AUTOMATION_TEMPLATES } from "../../../src/lib/automationTemplates";
import { summariseTree } from "../../../src/lib/conditionTree";

describe("AUTOMATION_TEMPLATES", () => {
  it("every template has a unique id and builds a named tree + actions", () => {
    const ids = new Set<string>();
    for (const t of AUTOMATION_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      const built = t.build();
      expect(built.name.length).toBeGreaterThan(0);
      expect(built.tree).toBeTruthy();
      expect(Array.isArray(built.actions)).toBe(true);
      // summary should be a non-empty, human string
      expect(summariseTree(built.tree).length).toBeGreaterThan(0);
    }
  });

  it("smart watering = (moisture<30 AND not rain) OR moisture<18, with a valve action", () => {
    const t = AUTOMATION_TEMPLATES.find((x) => x.id === "smart_watering")!;
    const { tree, actions } = t.build();
    expect(summariseTree(tree)).toBe("(moisture < 30% and not rain forecast (≥5mm)) or moisture < 18%");
    expect(actions[0].action_kind).toBe("valve_open");
  });

  it("scheduled-skip-rain includes a time + not-rain condition", () => {
    const t = AUTOMATION_TEMPLATES.find((x) => x.id === "scheduled_skip_rain")!;
    expect(summariseTree(t.build().tree)).toContain("not rain forecast");
    expect(summariseTree(t.build().tree)).toContain("Time is");
  });
});
