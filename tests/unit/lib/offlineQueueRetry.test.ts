import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// bug-audit-2026-07-10 #20 — a write queued while (nominally) ONLINE (a
// transient / lie-fi failure) must schedule its own flush; the `online` event
// won't fire because we never left the online state, so without this the write
// stranded until the next app start.

const { getSessionMock, fromMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn().mockResolvedValue({ data: { session: null } }),
  fromMock: vi.fn(),
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: { auth: { getSession: getSessionMock }, from: fromMock },
}));

import { enqueue, clearQueue } from "../../../src/lib/offlineQueue";

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: v });
}

describe("offlineQueue enqueue — auto-flush trigger (bug-audit #20)", () => {
  beforeEach(() => {
    clearQueue();
    getSessionMock.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
  });

  test("queuing while online schedules a flush (which begins by reading the session)", async () => {
    setOnline(true);
    enqueue({ kind: "db-write", table: "notes", op: "insert", payload: { id: "n1" } });
    // Not flushed synchronously.
    expect(getSessionMock).not.toHaveBeenCalled();
    // The debounced retry fires after the backoff and runs flushQueue.
    await vi.advanceTimersByTimeAsync(6_000);
    expect(getSessionMock).toHaveBeenCalled();
  });

  test("queuing while offline does NOT flush (waits for the online event)", async () => {
    setOnline(false);
    enqueue({ kind: "db-write", table: "notes", op: "insert", payload: { id: "n2" } });
    await vi.advanceTimersByTimeAsync(6_000);
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
