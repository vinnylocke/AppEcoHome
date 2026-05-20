import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock Capacitor — default to web; individual tests flip isNativePlatform.
const isNativeMock = vi.fn<() => boolean>(() => false);
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => isNativeMock(),
  },
}));

// Dynamic import after mocks are in place.
async function loadHook() {
  const mod = await import("../../../src/hooks/useIsMobile");
  return mod.useIsMobile;
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("useIsMobile", () => {
  beforeEach(() => {
    isNativeMock.mockReturnValue(false);
    setViewport(1280);
  });

  afterEach(() => {
    vi.resetModules();
  });

  test("returns true on native platforms regardless of viewport", async () => {
    isNativeMock.mockReturnValue(true);
    setViewport(2000); // wide
    const useIsMobile = await loadHook();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test("returns true on web below the 768px threshold", async () => {
    setViewport(375);
    const useIsMobile = await loadHook();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test("returns false on web at or above the 768px threshold", async () => {
    setViewport(768);
    const useIsMobile = await loadHook();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test("returns false on web for desktop viewports", async () => {
    setViewport(1440);
    const useIsMobile = await loadHook();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test("re-evaluates when window resizes from desktop to mobile", async () => {
    setViewport(1024);
    const useIsMobile = await loadHook();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      setViewport(420);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(true);
  });

  test("re-evaluates when window resizes from mobile to desktop", async () => {
    setViewport(420);
    const useIsMobile = await loadHook();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    act(() => {
      setViewport(1024);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(false);
  });
});
