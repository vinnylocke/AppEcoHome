import { describe, test, expect, vi, afterEach } from "vitest";

// Mock the toast module so we can assert the friendly gate message.
const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({ default: { error: (...a: unknown[]) => toastError(...a) } }));

import { requireOnline } from "../../../src/lib/requireOnline";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

describe("requireOnline", () => {
  afterEach(() => {
    toastError.mockClear();
    setOnline(true);
  });

  test("returns true and stays silent when online", () => {
    setOnline(true);
    expect(requireOnline("Plant Lens")).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  test("returns false and toasts a feature-specific message when offline", () => {
    setOnline(false);
    expect(requireOnline("Plant Lens")).toBe(false);
    expect(toastError).toHaveBeenCalledOnce();
    const [msg] = toastError.mock.calls[0];
    expect(msg).toContain("Plant Lens");
    expect(msg).toMatch(/offline/i);
  });

  test("dedupes rapid re-taps via a stable toast id", () => {
    setOnline(false);
    requireOnline("Garden AI chat");
    const [, opts] = toastError.mock.calls[0] as [string, { id?: string }];
    expect(opts?.id).toBe("offline-gate-Garden AI chat");
  });
});
