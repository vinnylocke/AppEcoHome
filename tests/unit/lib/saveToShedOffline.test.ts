import { describe, test, expect, vi, beforeEach } from "vitest";

// Hoisted mocks referenced by the vi.mock factories below.
const { insertOrQueueMock, isOfflineMock, readDashboardCacheMock, supabaseMock } = vi.hoisted(() => {
  const insertOrQueueMock = vi.fn(async () => ({ queued: true }));
  const isOfflineMock = vi.fn(() => true);
  const readDashboardCacheMock = vi.fn(() => ({
    snapshot: { homeLatLng: { lat: 51.5, lng: -0.1 } },
  }));
  // supabase must exist for the import, but the offline branch must never call it.
  const supabaseMock = { from: vi.fn(() => { throw new Error("supabase should not be touched offline"); }) };
  return { insertOrQueueMock, isOfflineMock, readDashboardCacheMock, supabaseMock };
});

vi.mock("../../../src/lib/queuedWrite", () => ({ insertOrQueue: insertOrQueueMock }));
vi.mock("../../../src/hooks/useOnline", () => ({ isOffline: isOfflineMock }));
vi.mock("../../../src/lib/dashboardCache", () => ({ readDashboardCache: readDashboardCacheMock }));
vi.mock("../../../src/lib/supabase", () => ({ supabase: supabaseMock }));

import { saveToShed } from "../../../src/lib/saveToShed";

const HOME = "00000000-0000-0000-0000-000000000002";

describe("saveToShed — offline branch", () => {
  beforeEach(() => {
    insertOrQueueMock.mockClear();
    supabaseMock.from.mockClear();
    isOfflineMock.mockReturnValue(true);
  });

  test("offline: queues the plant insert with a client-generated integer id, never touches supabase", async () => {
    const res = await saveToShed(
      { common_name: "Rosemary", source: "manual", perenual_id: null },
      undefined,
      HOME,
    );
    expect(typeof res.plantId).toBe("number");
    expect(supabaseMock.from).not.toHaveBeenCalled();

    const plantCall = insertOrQueueMock.mock.calls.find((c) => c[0] === "plants");
    expect(plantCall).toBeTruthy();
    expect(plantCall![1]).toMatchObject({ id: res.plantId, home_id: HOME, common_name: "Rosemary" });
  });

  test("offline: queues auto-seasonal schedules, each with a client uuid and the plant_id", async () => {
    const res = await saveToShed(
      { common_name: "Basil", source: "manual", perenual_id: null, watering_min_days: 3, watering_max_days: 10 },
      undefined,
      HOME,
    );
    const scheduleCalls = insertOrQueueMock.mock.calls.filter((c) => c[0] === "plant_schedules");
    expect(scheduleCalls.length).toBeGreaterThan(0);
    for (const call of scheduleCalls) {
      const row = call[1] as Record<string, unknown>;
      expect(typeof row.id).toBe("string"); // client uuid
      expect(row.plant_id).toBe(res.plantId);
    }
  });

  test("offline: respects a caller-supplied id", async () => {
    const res = await saveToShed(
      { id: 424242, common_name: "Thyme", source: "manual", perenual_id: null },
      undefined,
      HOME,
    );
    expect(res.plantId).toBe(424242);
  });
});
