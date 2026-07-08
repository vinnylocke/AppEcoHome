import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  writeSnapshot,
  readSnapshot,
  clearAllSnapshots,
} from "../../../src/lib/snapshotCache";

// jsdom ships a read-only localStorage; install a Map-backed mock (same
// pattern as dashboardCache/profileCache tests).
function installMockLocalStorage(): { restore: () => void } {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(k: string) { return store.has(k) ? store.get(k)! : null; },
    key(i: number) { const a = Array.from(store.keys()); return i < a.length ? a[i] : null; },
    removeItem(k: string) { store.delete(k); },
    setItem(k: string, v: string) { store.set(k, String(v)); },
  };
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", { configurable: true, value: mock });
  return {
    restore: () => {
      if (original) Object.defineProperty(window, "localStorage", original);
      else delete (window as any).localStorage;
    },
  };
}

let ls: { restore: () => void };

describe("snapshotCache", () => {
  beforeEach(() => { ls = installMockLocalStorage(); });
  afterEach(() => { ls.restore(); });

  test("round-trips arbitrary data keyed by (name, scope)", () => {
    const rows = [{ id: "1", title: "Water" }, { id: "2", title: "Prune" }];
    writeSnapshot("tasks", "home-1", rows);
    const snap = readSnapshot<typeof rows>("tasks", "home-1");
    expect(snap?.data).toEqual(rows);
    expect(typeof snap?.cachedAt).toBe("number");
  });

  test("is isolated per name and per scope", () => {
    writeSnapshot("tasks", "home-1", [1, 2, 3]);
    expect(readSnapshot("tasks", "home-2")).toBeNull();
    expect(readSnapshot("journal", "home-1")).toBeNull();
  });

  test("returns null for a falsy scope (idle callers)", () => {
    expect(readSnapshot("tasks", "")).toBeNull();
    writeSnapshot("tasks", "", [1]); // no-op, no throw
    expect(readSnapshot("tasks", "")).toBeNull();
  });

  test("survives corrupt JSON", () => {
    localStorage.setItem("rhozly:snap:v1:tasks:home-1", "{broken");
    expect(readSnapshot("tasks", "home-1")).toBeNull();
  });

  test("ignores a payload missing the envelope shape", () => {
    localStorage.setItem("rhozly:snap:v1:tasks:home-1", JSON.stringify([1, 2]));
    expect(readSnapshot("tasks", "home-1")).toBeNull();
  });

  test("clearAllSnapshots wipes every snapshot but nothing else", () => {
    writeSnapshot("tasks", "home-1", [1]);
    writeSnapshot("journal", "home-9", [2]);
    localStorage.setItem("rhozly_other_key", "keep-me");
    clearAllSnapshots();
    expect(readSnapshot("tasks", "home-1")).toBeNull();
    expect(readSnapshot("journal", "home-9")).toBeNull();
    expect(localStorage.getItem("rhozly_other_key")).toBe("keep-me");
  });
});
