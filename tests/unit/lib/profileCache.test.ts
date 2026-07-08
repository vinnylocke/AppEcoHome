import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  writeProfileCache,
  readProfileCache,
  clearAllProfileCaches,
  type CachedProfile,
} from "../../../src/lib/profileCache";

// jsdom ships a partial localStorage (read-only). Install a Map-backed mock
// so setItem works (same pattern as dashboardCache.test.ts).
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
  Object.defineProperty(window, "localStorage", { configurable: true, value: mock });
  return {
    restore: () => {
      if (original) Object.defineProperty(window, "localStorage", original);
      else delete (window as any).localStorage;
    },
  };
}

let ls: { restore: () => void };

// Offline-first Phase 0 keystone: the cached profile is what lets a no-signal
// cold-open boot into the app instead of the error screen.

const sample: CachedProfile = {
  uid: "user-1",
  home_id: "home-1",
  display_name: "Vinny",
  first_name: "Vinny",
  last_name: "Locke",
  subscription_tier: "evergreen",
  ai_enabled: true,
  enable_perenual: true,
  is_admin: false,
  onboarding_state: { done: true },
  can_view_audit: false,
  is_beta: true,
};

describe("profileCache", () => {
  beforeEach(() => {
    ls = installMockLocalStorage();
  });
  afterEach(() => {
    ls.restore();
  });

  test("round-trips a profile for its user", () => {
    writeProfileCache("user-1", sample);
    expect(readProfileCache("user-1")).toEqual(sample);
  });

  test("is keyed per-user — one account never reads another's profile", () => {
    writeProfileCache("user-1", sample);
    expect(readProfileCache("user-2")).toBeNull();
  });

  test("rejects a row whose uid doesn't match the requested user (tamper guard)", () => {
    // Directly plant a mismatched row under user-2's key.
    localStorage.setItem("rhozly:profile:v1:user-2", JSON.stringify({ ...sample, uid: "user-1" }));
    expect(readProfileCache("user-2")).toBeNull();
  });

  test("returns null for an unknown user and empty input", () => {
    expect(readProfileCache("nobody")).toBeNull();
    expect(readProfileCache("")).toBeNull();
  });

  test("clearAllProfileCaches wipes every cached profile", () => {
    writeProfileCache("user-1", sample);
    writeProfileCache("user-9", { ...sample, uid: "user-9" });
    clearAllProfileCaches();
    expect(readProfileCache("user-1")).toBeNull();
    expect(readProfileCache("user-9")).toBeNull();
  });

  test("survives corrupt JSON without throwing", () => {
    localStorage.setItem("rhozly:profile:v1:user-1", "{not json");
    expect(readProfileCache("user-1")).toBeNull();
  });
});
