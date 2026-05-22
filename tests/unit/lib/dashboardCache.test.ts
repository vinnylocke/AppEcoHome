import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readDashboardCache,
  writeDashboardCache,
  clearDashboardCache,
  clearAllDashboardCaches,
  DASHBOARD_CACHE_KEY_PREFIX,
  DASHBOARD_CACHE_TTL_MS,
  type DashboardSnapshot,
} from "../../../src/lib/dashboardCache";

const HOME_A = "home-a";
const HOME_B = "home-b";

function makeSnapshot(): Omit<DashboardSnapshot, "cachedAt"> {
  return {
    rawWeather: { foo: "bar" },
    weather: { temp: 18 },
    locations: [{ id: "loc-1", name: "Back" }],
    homeLatLng: { lat: 51.5, lng: -0.1 },
    hardinessZone: 9,
    overdueTaskCount: 2,
    alerts: [{ id: "a-1" }],
    locationTaskCounts: { "loc-1": 3 },
  };
}

// jsdom in this project ships a partial localStorage polyfill that
// only exposes the read-side methods (getItem / removeItem / length /
// key). The cache writes use setItem + Storage event semantics, so we
// install a complete Map-backed mock for these tests and restore the
// original at the end.
function installMockLocalStorage(): { restore: () => void } {
  const store = new Map<string, string>();
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

describe("dashboardCache", () => {
  let storageMock: { restore: () => void };

  beforeEach(() => {
    storageMock = installMockLocalStorage();
  });

  afterEach(() => {
    storageMock.restore();
    vi.useRealTimers();
  });

  test("read returns null on empty storage", () => {
    expect(readDashboardCache(HOME_A)).toBeNull();
  });

  test("write then read round-trips the snapshot", () => {
    writeDashboardCache(HOME_A, makeSnapshot());
    const result = readDashboardCache(HOME_A);
    expect(result).not.toBeNull();
    expect(result?.snapshot.overdueTaskCount).toBe(2);
    expect(result?.snapshot.locations).toEqual([{ id: "loc-1", name: "Back" }]);
    expect(result?.snapshot.cachedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result?.isStale).toBe(false);
    expect(result?.ageMs).toBeGreaterThanOrEqual(0);
  });

  test("isStale flips when the cache is older than the TTL", () => {
    vi.useFakeTimers();
    const oldDate = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(oldDate);
    writeDashboardCache(HOME_A, makeSnapshot());

    // Jump past the TTL.
    vi.setSystemTime(new Date(oldDate.getTime() + DASHBOARD_CACHE_TTL_MS + 60_000));
    const result = readDashboardCache(HOME_A);
    expect(result?.isStale).toBe(true);
    expect(result?.snapshot.overdueTaskCount).toBe(2); // still returns the data
  });

  test("clearDashboardCache removes only the specified home", () => {
    writeDashboardCache(HOME_A, makeSnapshot());
    writeDashboardCache(HOME_B, makeSnapshot());
    clearDashboardCache(HOME_A);
    expect(readDashboardCache(HOME_A)).toBeNull();
    expect(readDashboardCache(HOME_B)).not.toBeNull();
  });

  test("clearAllDashboardCaches removes every dashboard entry but leaves others", () => {
    writeDashboardCache(HOME_A, makeSnapshot());
    writeDashboardCache(HOME_B, makeSnapshot());
    window.localStorage.setItem("unrelated:key", "should-survive");

    clearAllDashboardCaches();

    expect(readDashboardCache(HOME_A)).toBeNull();
    expect(readDashboardCache(HOME_B)).toBeNull();
    expect(window.localStorage.getItem("unrelated:key")).toBe("should-survive");
  });

  test("read clears + returns null on a corrupt blob", () => {
    const key = `${DASHBOARD_CACHE_KEY_PREFIX}:${HOME_A}`;
    window.localStorage.setItem(key, "not-json{");
    expect(readDashboardCache(HOME_A)).toBeNull();
    // Corrupt entry was cleared as a side effect.
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  test("read clears + returns null on a wrong-shape blob", () => {
    const key = `${DASHBOARD_CACHE_KEY_PREFIX}:${HOME_A}`;
    window.localStorage.setItem(
      key,
      JSON.stringify({ cachedAt: "x", locations: "not-an-array" }),
    );
    expect(readDashboardCache(HOME_A)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  test("write with empty homeId is a no-op", () => {
    writeDashboardCache("", makeSnapshot());
    // No keys with the prefix should exist.
    let found = false;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(DASHBOARD_CACHE_KEY_PREFIX)) found = true;
    }
    expect(found).toBe(false);
  });

  test("overwriting refreshes cachedAt", async () => {
    writeDashboardCache(HOME_A, makeSnapshot());
    const first = readDashboardCache(HOME_A)!;
    await new Promise((r) => setTimeout(r, 5));
    writeDashboardCache(HOME_A, { ...makeSnapshot(), overdueTaskCount: 9 });
    const second = readDashboardCache(HOME_A)!;
    expect(second.snapshot.overdueTaskCount).toBe(9);
    expect(new Date(second.snapshot.cachedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.snapshot.cachedAt).getTime(),
    );
  });
});
