import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  effectivePersona,
  resolveHomePosture,
  readStoredPosture,
  storePosture,
  HOME_PRESETS,
  PRESET_KEY,
  LEGACY_DENSITY_KEY,
} from "../../../src/lib/personaPresets";

describe("effectivePersona — the canonical null⇒new collapse", () => {
  test("experienced stays experienced", () => {
    expect(effectivePersona("experienced")).toBe("experienced");
  });
  test("new stays new", () => {
    expect(effectivePersona("new")).toBe("new");
  });
  test("null (never asked / loading) collapses to new — the guided default", () => {
    expect(effectivePersona(null)).toBe("new");
  });
});

describe("resolveHomePosture — override > legacy alias > persona ladder", () => {
  test("explicit stored posture always wins, even against persona", () => {
    expect(resolveHomePosture("experienced", "porch")).toBe("porch");
    expect(resolveHomePosture("new", "workbench")).toBe("workbench");
    expect(resolveHomePosture(null, "workbench")).toBe("workbench");
  });
  test("no override: experienced persona → workbench", () => {
    expect(resolveHomePosture("experienced", null)).toBe("workbench");
  });
  test("no override: new persona → porch", () => {
    expect(resolveHomePosture("new", null)).toBe("porch");
  });
  test("no override: null persona → porch (safer, more guided)", () => {
    expect(resolveHomePosture(null, null)).toBe("porch");
  });
});

describe("readStoredPosture — localStorage ladder with the legacy density alias", () => {
  // jsdom ships a partial localStorage (read-only). Install a Map-backed
  // mock so setItem/clear work (same pattern as profileCache.test.ts).
  const store = new Map<string, string>();
  let original: PropertyDescriptor | undefined;

  beforeAll(() => {
    const mock: Storage = {
      get length() { return store.size; },
      clear() { store.clear(); },
      getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
      key(index: number) {
        const arr = Array.from(store.keys());
        return index < arr.length ? arr[index] : null;
      },
      removeItem(key: string) { store.delete(key); },
      setItem(key: string, value: string) { store.set(key, String(value)); },
    };
    original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, value: mock });
  });

  afterAll(() => {
    if (original) Object.defineProperty(window, "localStorage", original);
  });

  beforeEach(() => {
    store.clear();
  });

  test("returns null when nothing stored", () => {
    expect(readStoredPosture()).toBeNull();
  });
  test("reads an explicit preset key", () => {
    localStorage.setItem(PRESET_KEY, "workbench");
    expect(readStoredPosture()).toBe("workbench");
  });
  test("ignores garbage in the preset key", () => {
    localStorage.setItem(PRESET_KEY, "banana");
    expect(readStoredPosture()).toBeNull();
  });
  test("legacy density 'detailed' aliases to workbench", () => {
    localStorage.setItem(LEGACY_DENSITY_KEY, "detailed");
    expect(readStoredPosture()).toBe("workbench");
  });
  test("legacy density 'simple' aliases to porch", () => {
    localStorage.setItem(LEGACY_DENSITY_KEY, "simple");
    expect(readStoredPosture()).toBe("porch");
  });
  test("explicit preset key beats the legacy density alias", () => {
    localStorage.setItem(LEGACY_DENSITY_KEY, "detailed");
    localStorage.setItem(PRESET_KEY, "porch");
    expect(readStoredPosture()).toBe("porch");
  });
  test("storePosture round-trips through readStoredPosture", () => {
    storePosture("workbench");
    expect(readStoredPosture()).toBe("workbench");
  });
});

describe("HOME_PRESETS — structural invariants the section loop depends on", () => {
  const postures = ["porch", "workbench"] as const;

  test("every preset starts with the hero", () => {
    for (const p of postures) {
      expect(HOME_PRESETS[p].sectionOrder[0]).toBe("hero");
    }
  });
  test("no duplicate sections within a preset", () => {
    for (const p of postures) {
      const order = HOME_PRESETS[p].sectionOrder;
      expect(new Set(order).size).toBe(order.length);
    }
  });
  test("today's tasks come before the garden in both postures (tasks-first — Stage 1)", () => {
    for (const p of postures) {
      const order = HOME_PRESETS[p].sectionOrder;
      expect(order).toContain("today");
      expect(order.indexOf("today")).toBeLessThan(order.indexOf("garden"));
    }
  });
  test("the Garden Walk tile (quickActions) sits directly after today in both postures", () => {
    for (const p of postures) {
      const order = HOME_PRESETS[p].sectionOrder;
      expect(order.indexOf("quickActions")).toBe(order.indexOf("today") + 1);
    }
  });
  test("posture identity: porch has nextBestAction+learn and no attention/week; workbench the inverse", () => {
    const porch = new Set(HOME_PRESETS.porch.sectionOrder);
    const bench = new Set(HOME_PRESETS.workbench.sectionOrder);
    expect(porch.has("nextBestAction")).toBe(true);
    expect(porch.has("learn")).toBe(true);
    expect(porch.has("attention")).toBe(false);
    expect(porch.has("week")).toBe(false);
    expect(bench.has("attention")).toBe(true);
    expect(bench.has("week")).toBe(true);
    expect(bench.has("nextBestAction")).toBe(false);
    expect(bench.has("learn")).toBe(false);
  });
});
