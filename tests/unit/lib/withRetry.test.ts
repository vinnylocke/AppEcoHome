import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../../../src/lib/withRetry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves on the first attempt without retry", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const promise = withRetry(fn, { label: "test" });
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries after a throw and resolves second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("good");
    const promise = withRetry(fn, { retries: 2, baseDelayMs: 100, label: "t" });
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe("good");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("retries on Supabase-shaped error result", async () => {
    const errorResult = { data: null, error: { message: "transient" } };
    const okResult = { data: "ok", error: null };
    const fn = vi
      .fn()
      .mockResolvedValueOnce(errorResult)
      .mockResolvedValueOnce(okResult);
    const promise = withRetry(fn, { retries: 2, baseDelayMs: 50, label: "t" });
    await vi.advanceTimersByTimeAsync(50);
    await expect(promise).resolves.toBe(okResult);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("returns the error result after exhausting retries (Supabase shape)", async () => {
    const errorResult = { data: null, error: { message: "permanent" } };
    const fn = vi.fn().mockResolvedValue(errorResult);
    const promise = withRetry(fn, { retries: 2, baseDelayMs: 10, label: "t" });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    await expect(promise).resolves.toBe(errorResult);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws after exhausting retries on consistent throws", async () => {
    const err = new Error("always fails");
    const fn = vi.fn().mockRejectedValue(err);
    const promise = withRetry(fn, { retries: 1, baseDelayMs: 10, label: "t" });
    const assertion = expect(promise).rejects.toBe(err);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("times out a slow attempt and retries", async () => {
    const fn = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise(() => { /* never resolves */ }),
      )
      .mockResolvedValueOnce("recovered");
    const promise = withRetry(fn, {
      retries: 1,
      baseDelayMs: 5,
      timeoutMs: 50,
      label: "t",
    });
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(5);
    await expect(promise).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("respects retries=0 (single attempt, no backoff)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("once"));
    const promise = withRetry(fn, { retries: 0, label: "t" });
    const assertion = expect(promise).rejects.toThrow("once");
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
