import { describe, test, expect } from "vitest";
import { parsePlantListLocal } from "../../../src/lib/parsePlantList";

describe("parsePlantListLocal", () => {
  test("empty / whitespace input returns empty array", () => {
    expect(parsePlantListLocal("")).toEqual([]);
    expect(parsePlantListLocal("   \n\n\t")).toEqual([]);
  });

  test("single bare common name", () => {
    const [p] = parsePlantListLocal("Tomato");
    expect(p.common_name).toBe("Tomato");
    expect(p.variety).toBeNull();
    expect(p.quantity).toBeNull();
    expect(p.notes).toBeNull();
  });

  test("two-word line splits name + variety", () => {
    const [p] = parsePlantListLocal("Tomato Sungold");
    expect(p.common_name).toBe("Tomato");
    expect(p.variety).toBe("Sungold");
  });

  test("quoted variety wins over two-word heuristic", () => {
    const [p] = parsePlantListLocal("Lavender 'Hidcote'");
    expect(p.common_name).toBe("Lavender");
    expect(p.variety).toBe("Hidcote");
  });

  test("double-quoted variety also wins", () => {
    const [p] = parsePlantListLocal(`Rose "Munstead Wood"`);
    expect(p.common_name).toBe("Rose");
    expect(p.variety).toBe("Munstead Wood");
  });

  test("compound common name (Pak Choi) is preserved", () => {
    const [p] = parsePlantListLocal("Pak Choi");
    expect(p.common_name).toBe("Pak Choi");
    expect(p.variety).toBeNull();
  });

  test("compound common name with trailing variety", () => {
    const [p] = parsePlantListLocal("Pak Choi Joi Choi");
    expect(p.common_name).toBe("Pak Choi");
    expect(p.variety).toBe("Joi Choi");
  });

  test("inline quantity x3", () => {
    const [p] = parsePlantListLocal("Tomato Sungold x3");
    expect(p.common_name).toBe("Tomato");
    expect(p.variety).toBe("Sungold");
    expect(p.quantity).toBe(3);
  });

  test("inline quantity '12 plants' inside parens", () => {
    const [p] = parsePlantListLocal("Lavender 'Hidcote' (12 plants, from RHS Wisley)");
    expect(p.common_name).toBe("Lavender");
    expect(p.variety).toBe("Hidcote");
    expect(p.quantity).toBe(12);
    expect(p.notes).not.toBeNull();
    expect(p.notes!.toLowerCase()).toContain("rhs wisley");
  });

  test("dash-separated notes block", () => {
    const [p] = parsePlantListLocal("Calendula - hedging, mixed colours");
    expect(p.common_name).toBe("Calendula");
    expect(p.notes).toContain("hedging");
  });

  test("multi-line input emits one entry per line", () => {
    const plants = parsePlantListLocal(`
Tomato Sungold x3
Lavender 'Hidcote' (12 plants)
Pak Choi
`);
    expect(plants).toHaveLength(3);
    expect(plants[0].common_name).toBe("Tomato");
    expect(plants[1].common_name).toBe("Lavender");
    expect(plants[2].common_name).toBe("Pak Choi");
  });

  test("strips a trailing parenthesised block but keeps the name", () => {
    const [p] = parsePlantListLocal("Strawberry (4 pots, summer fruiting)");
    expect(p.common_name).toBe("Strawberry");
    expect(p.quantity).toBe(4);
    expect(p.notes).toContain("summer fruiting");
  });

  test("three-word name with capitalised trailing variety", () => {
    const [p] = parsePlantListLocal("French Bean Cobra");
    // Trailing capitalised word becomes variety
    expect(p.common_name).toBe("French Bean");
    expect(p.variety).toBe("Cobra");
  });

  test("three-word name without obvious variety leaves variety null", () => {
    const [p] = parsePlantListLocal("hidden garden mint");
    // No capitalised trailing word and no compound match → leave as common_name
    expect(p.common_name).toBe("hidden garden mint");
    expect(p.variety).toBeNull();
  });

  test("caps quantity at sane upper bound", () => {
    const [p] = parsePlantListLocal("Wildflower mix 9999 plants");
    // 9999 exceeds the < 1000 guard so it doesn't get extracted
    expect(p.quantity).toBeNull();
  });

  test("max 60 plants per parse", () => {
    const lines = Array.from({ length: 80 }, (_, i) => `Plant${i}`).join("\n");
    const plants = parsePlantListLocal(lines);
    expect(plants).toHaveLength(60);
  });
});
