import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  effectivePersona,
  resolveHomePosture,
  readStoredPosture,
  storePosture,
  HOME_PRESETS,
  PRESET_KEY,
  LEGACY_DENSITY_KEY,
  type HomeSectionId,
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
  test("variants only reference sections present in the preset's order", () => {
    for (const p of postures) {
      const order = new Set(HOME_PRESETS[p].sectionOrder);
      for (const key of Object.keys(HOME_PRESETS[p].variants) as HomeSectionId[]) {
        expect(order.has(key)).toBe(true);
      }
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
  test("hero voices: porch=sentence, workbench=console (locked decision)", () => {
    expect(HOME_PRESETS.porch.variants.hero).toBe("sentence");
    expect(HOME_PRESETS.workbench.variants.hero).toBe("console");
  });
  test("promo: porch renders the card in-flow; workbench demotes to a line", () => {
    expect(HOME_PRESETS.porch.variants.promo).toBe("card");
    expect(HOME_PRESETS.workbench.variants.promo).toBe("line");
  });
});
