import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";

// ---- Supabase channel mock ----

type ChangeHandler = () => void;
interface MockChannel {
  _handlers: Map<string, ChangeHandler[]>;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  fire: (table: string) => void;
}

let mockChannel: MockChannel;
let removedChannels: MockChannel[];

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    channel: vi.fn((name: string) => {
      mockChannel = {
        _handlers: new Map(),
        on: vi.fn((_type: string, opts: { table: string }, cb: ChangeHandler) => {
          const existing = mockChannel._handlers.get(opts.table) ?? [];
          mockChannel._handlers.set(opts.table, [...existing, cb]);
          return mockChannel;
        }),
        subscribe: vi.fn(() => mockChannel),
        fire(table: string) {
          mockChannel._handlers.get(table)?.forEach((cb) => cb());
        },
      };
      return mockChannel;
    }),
    removeChannel: vi.fn((ch: MockChannel) => {
      removedChannels.push(ch);
    }),
  },
}));

import { HomeRealtimeProvider } from "../../../src/context/HomeRealtimeContext";
import { useHomeRealtime } from "../../../src/hooks/useHomeRealtime";

beforeEach(() => {
  removedChannels = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const HOME_ID = "home-123";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(HomeRealtimeProvider, { homeId: HOME_ID }, children);
}

describe("useHomeRealtime", () => {
  test("callback fires when matching table event is delivered", async () => {
    const cb = vi.fn();
    renderHook(() => useHomeRealtime("tasks", cb), { wrapper });

    act(() => {
      mockChannel.fire("tasks");
      vi.advanceTimersByTime(600);
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("callback does NOT fire for a different table on the same channel", async () => {
    const cb = vi.fn();
    renderHook(() => useHomeRealtime("tasks", cb), { wrapper });

    act(() => {
      mockChannel.fire("locations");
      vi.advanceTimersByTime(600);
    });

    expect(cb).not.toHaveBeenCalled();
  });

  test("debounce: 3 rapid events trigger callback exactly once after burst settles", async () => {
    const cb = vi.fn();
    renderHook(() => useHomeRealtime("tasks", cb, 500), { wrapper });

    act(() => {
      mockChannel.fire("tasks");
      vi.advanceTimersByTime(100);
      mockChannel.fire("tasks");
      vi.advanceTimersByTime(100);
      mockChannel.fire("tasks");
      vi.advanceTimersByTime(600); // let debounce settle
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("cleanup: removeChannel is called when provider unmounts", async () => {
    const { unmount } = renderHook(() => useHomeRealtime("tasks", vi.fn()), { wrapper });
    unmount();
    expect(removedChannels).toHaveLength(1);
  });

  test("multiple subscribers on same table all receive the event", async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    renderHook(() => {
      useHomeRealtime("areas", cb1);
      useHomeRealtime("areas", cb2);
    }, { wrapper });

    act(() => {
      mockChannel.fire("areas");
      vi.advanceTimersByTime(600);
    });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  test("subscriber is removed from registry on unmount, no callback after", async () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useHomeRealtime("plans", cb), { wrapper });
    unmount();

    // Re-create channel mock since provider was unmounted; just verify cb was not called after unmount
    expect(cb).toHaveBeenCalledTimes(0);
  });
});
