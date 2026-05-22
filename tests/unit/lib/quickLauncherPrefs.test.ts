import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  clearLocalPins,
  readLocalPins,
  sanitisePins,
  writeLocalPins,
} from "../../../src/lib/quickLauncherPrefs";
import { DEFAULT_QUICK_LAUNCHER_PINS } from "../../../src/lib/quickLauncherCatalogue";

function installMockLocalStorage(): { restore: () => void } {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      const arr = Array.from(store.keys());
      return index < arr.length ? arr[index] : null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: mock,
  });
  return {
    restore: () => {
      if (original) {
        Object.defineProperty(window, "localStorage", original);
      } else {
        // @ts-expect-error — best-effort restore when no descriptor exists
        delete (window as any).localStorage;
      }
    },
  };
}

describe("sanitisePins", () => {
  test("drops unknown ids", () => {
    const result = sanitisePins(["lens", "not-a-real-id", "today"]);
    expect(result).toEqual(["lens", "today"]);
  });

  test("drops duplicates preserving first occurrence", () => {
    const result = sanitisePins(["lens", "today", "lens", "capture"]);
    expect(result).toEqual(["lens", "today", "capture"]);
  });

  test("trims to MAX (6)", () => {
    const result = sanitisePins([
      "lens",
      "today",
      "capture",
      "library",
      "shed",
      "planner",
      "walk",
      "doctor",
      "shopping",
    ]);
    expect(result).toHaveLength(6);
    expect(result).toEqual(["lens", "today", "capture", "library", "shed", "planner"]);
  });

  test("falls back to defaults when empty", () => {
    expect(sanitisePins([])).toEqual([...DEFAULT_QUICK_LAUNCHER_PINS]);
  });

  test("falls back to defaults when input is not an array", () => {
    expect(sanitisePins(null)).toEqual([...DEFAULT_QUICK_LAUNCHER_PINS]);
    expect(sanitisePins(undefined)).toEqual([...DEFAULT_QUICK_LAUNCHER_PINS]);
    expect(sanitisePins("lens" as unknown)).toEqual([
      ...DEFAULT_QUICK_LAUNCHER_PINS,
    ]);
  });

  test("falls back to defaults when result is below MIN (1) after filtering", () => {
    expect(sanitisePins(["not-real", "also-not-real"])).toEqual([
      ...DEFAULT_QUICK_LAUNCHER_PINS,
    ]);
  });

  test("ignores non-string entries", () => {
    expect(sanitisePins([1, true, "lens", null, "today"])).toEqual([
      "lens",
      "today",
    ]);
  });
});

describe("readLocalPins / writeLocalPins / clearLocalPins", () => {
  let restoreLs: () => void;
  beforeEach(() => {
    const m = installMockLocalStorage();
    restoreLs = m.restore;
  });
  afterEach(() => restoreLs());

  test("returns defaults when no key is set", () => {
    expect(readLocalPins()).toEqual([...DEFAULT_QUICK_LAUNCHER_PINS]);
  });

  test("round-trips a saved list", () => {
    writeLocalPins(["shed", "planner", "walk"]);
    expect(readLocalPins()).toEqual(["shed", "planner", "walk"]);
  });

  test("clears the key", () => {
    writeLocalPins(["shed", "planner"]);
    clearLocalPins();
    expect(readLocalPins()).toEqual([...DEFAULT_QUICK_LAUNCHER_PINS]);
  });

  test("recovers from a corrupt blob", () => {
    window.localStorage.setItem("rhozly_quick_launcher_v1", "not-json{");
    expect(readLocalPins()).toEqual([...DEFAULT_QUICK_LAUNCHER_PINS]);
    // Corrupt blob should have been cleared by the recovery path.
    expect(window.localStorage.getItem("rhozly_quick_launcher_v1")).toBeNull();
  });

  test("recovers from a wrong-shape blob (no `pinned` key)", () => {
    window.localStorage.setItem(
      "rhozly_quick_launcher_v1",
      JSON.stringify({ foo: "bar" }),
    );
    expect(readLocalPins()).toEqual([...DEFAULT_QUICK_LAUNCHER_PINS]);
  });

  test("write sanitises before persisting", () => {
    writeLocalPins(["lens", "lens", "bogus", "today"]);
    expect(readLocalPins()).toEqual(["lens", "today"]);
  });
});
