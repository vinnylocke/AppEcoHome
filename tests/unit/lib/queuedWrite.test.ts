import { describe, test, expect, vi, beforeEach } from "vitest";

// Hoisted mocks so the vi.mock factories can reference them.
const { enqueueMock, updateResult, insertResult, deleteResult, supabaseMock } = vi.hoisted(() => {
  const enqueueMock = vi.fn();
  const insertResult = { value: { error: null as unknown } };
  const updateResult = { value: { error: null as unknown } };
  const deleteResult = { value: { error: null as unknown } };
  const supabaseMock = {
    from: vi.fn(() => ({
      insert: vi.fn(() => Promise.resolve(insertResult.value)),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(updateResult.value)) })),
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(deleteResult.value)) })),
    })),
  };
  return { enqueueMock, updateResult, insertResult, deleteResult, supabaseMock };
});

vi.mock("../../../src/lib/supabase", () => ({ supabase: supabaseMock }));
vi.mock("../../../src/lib/offlineQueue", () => ({ enqueue: enqueueMock }));

import { insertOrQueue, updateOrQueue, deleteOrQueue } from "../../../src/lib/queuedWrite";

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: v });
}

describe("queuedWrite", () => {
  beforeEach(() => {
    enqueueMock.mockClear();
    supabaseMock.from.mockClear();
    insertResult.value = { error: null };
    updateResult.value = { error: null };
    deleteResult.value = { error: null };
    setOnline(true);
  });

  test("offline: enqueues without touching supabase", async () => {
    setOnline(false);
    const r = await insertOrQueue("tasks", { id: "t1", title: "Water" });
    expect(r.queued).toBe(true);
    expect(enqueueMock).toHaveBeenCalledOnce();
    expect(supabaseMock.from).not.toHaveBeenCalled();
    const item = enqueueMock.mock.calls[0][0];
    expect(item).toMatchObject({ kind: "db-write", table: "tasks", op: "insert" });
  });

  test("online success: writes, does not queue", async () => {
    const r = await updateOrQueue("tasks", { status: "Completed" }, { column: "id", value: "t1" });
    expect(r.queued).toBe(false);
    expect(r.error).toBeUndefined();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  test("online network failure (no code): queues for retry", async () => {
    updateResult.value = { error: { message: "network" } }; // no code/status → transient
    const r = await updateOrQueue("tasks", { status: "Completed" }, { column: "id", value: "t1" });
    expect(r.queued).toBe(true);
    expect(enqueueMock).toHaveBeenCalledOnce();
  });

  test("online permanent failure (has code): NOT queued, returns error", async () => {
    insertResult.value = { error: { code: "23505", message: "duplicate" } };
    const r = await insertOrQueue("tasks", { id: "t1" });
    expect(r.queued).toBe(false);
    expect(r.error).toBeTruthy();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  test("delete offline: enqueues a db-write delete", async () => {
    setOnline(false);
    const r = await deleteOrQueue("shopping_list_items", { column: "id", value: "s1" });
    expect(r.queued).toBe(true);
    const item = enqueueMock.mock.calls[0][0];
    expect(item).toMatchObject({ kind: "db-write", op: "delete", match: { column: "id", value: "s1" } });
  });
});
