import { supabase } from "./supabase";

/**
 * Small offline-aware write queue.
 *
 * When a mutation fails because the user is offline (or the request 502s),
 * we push a `QueuedWrite` onto localStorage. As soon as the device comes
 * back online, `flushQueue()` replays each item via Supabase.
 *
 * Limited to a small whitelist of write shapes so the persisted payload
 * stays trustworthy across app versions. Adding a new shape requires
 * extending `QueuedWrite["op"]` + the executor in `applyOne()`.
 */

export type QueuedWrite =
  | {
      id: string;
      kind: "task-status";
      taskId: string;
      status: "Pending" | "Completed";
      completedAt: string | null;
      completedBy: string | null;
      queuedAt: number;
    };

const STORAGE_KEY = "rhozly_offline_queue_v1";
const LISTENERS = new Set<() => void>();

function read(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QueuedWrite[];
  } catch {
    return [];
  }
}

function write(items: QueuedWrite[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota or disabled — ignore */
  }
  LISTENERS.forEach((fn) => {
    try { fn(); } catch { /* noop */ }
  });
}

export function getQueue(): QueuedWrite[] {
  return read();
}

export function enqueue(item: Omit<QueuedWrite, "id" | "queuedAt">): QueuedWrite {
  const queued: QueuedWrite = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
  } as QueuedWrite;
  write([...read(), queued]);
  return queued;
}

export function remove(id: string) {
  write(read().filter((q) => q.id !== id));
}

export function subscribe(fn: () => void): () => void {
  LISTENERS.add(fn);
  return () => { LISTENERS.delete(fn); };
}

async function applyOne(item: QueuedWrite): Promise<void> {
  if (item.kind === "task-status") {
    const { error } = await supabase
      .from("tasks")
      .update({
        status:       item.status,
        completed_at: item.completedAt,
        completed_by: item.completedBy,
      })
      .eq("id", item.taskId);
    if (error) throw error;
    return;
  }
  // Unknown kind — drop it so the queue doesn't loop forever on a stale shape.
}

let flushing = false;
let pendingFlush = false;

/**
 * Replay every queued write. Skips items that fail with a non-transient
 * error (so we don't blow the user's queue away on a single bad row).
 * Returns the number of items successfully flushed.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) { pendingFlush = true; return 0; }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  flushing = true;
  let succeeded = 0;
  try {
    const queue = read();
    for (const item of queue) {
      try {
        await applyOne(item);
        remove(item.id);
        succeeded += 1;
      } catch {
        // Stop on first failure — if the network is bad, give up and retry later.
        break;
      }
    }
  } finally {
    flushing = false;
    if (pendingFlush) {
      pendingFlush = false;
      // Schedule another pass so any items still in the queue get a chance.
      setTimeout(() => { void flushQueue(); }, 100);
    }
  }
  return succeeded;
}

/**
 * Wire window `online` to auto-flush. Call once near the app root.
 */
export function bootstrapOfflineQueue(): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => { void flushQueue(); };
  window.addEventListener("online", onOnline);
  // Best-effort flush on startup in case items are stale from a previous session.
  if (navigator.onLine) {
    setTimeout(() => { void flushQueue(); }, 1500);
  }
  return () => window.removeEventListener("online", onOnline);
}
