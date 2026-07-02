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

interface BaseQueued {
  id: string;
  queuedAt: number;
  /** Auth user the write was queued under — stamped at enqueue when known.
   *  Flush refuses to replay another account's items (see flushQueue). */
  userId?: string | null;
  attempts?: number;
  lastError?: string | null;
}

export type QueuedWrite =
  | (BaseQueued & {
      kind: "task-status";
      taskId: string;
      status: "Pending" | "Completed";
      completedAt: string | null;
      completedBy: string | null;
    })
  | (BaseQueued & {
      kind: "task-postpone";
      taskId: string;
      newDueDate: string;
    })
  | (BaseQueued & {
      kind: "journal-add";
      homeId: string;
      inventoryItemId: string;
      subject: string;
      description: string | null;
      imageUrl: string | null;
      taskId: string | null;
    })
  | (BaseQueued & {
      kind: "ailment-link";
      homeId: string;
      plantInstanceId: string;
      ailmentId: string;
      linkedBy: string | null;
      photoUrl: string | null;
      notes: string | null;
    });

const STORAGE_KEY = "rhozly_offline_queue_v1";
const LISTENERS = new Set<() => void>();

// Cross-tab reactivity: `storage` fires in OTHER tabs when this key changes,
// so a flush in tab A updates tab B's badge instead of leaving it stale.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    LISTENERS.forEach((fn) => {
      try { fn(); } catch { /* noop */ }
    });
  });
}

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

// Tracked by bootstrapOfflineQueue's auth listener so the synchronous
// enqueue() can stamp items without an async session lookup.
let knownUserId: string | null = null;

// Omit distributed over the QueuedWrite union — a plain Omit collapses the
// union to its common keys, losing variant fields like `taskId`.
type QueuedWriteInput = QueuedWrite extends infer T
  ? T extends QueuedWrite
    ? Omit<T, "id" | "queuedAt">
    : never
  : never;

export function enqueue(item: QueuedWriteInput): QueuedWrite {
  const queued: QueuedWrite = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
    userId: knownUserId,
  } as QueuedWrite;
  write([...read(), queued]);
  return queued;
}

export function remove(id: string) {
  write(read().filter((q) => q.id !== id));
}

/** Drop everything — called on sign-out so the next account on this device
 *  can never replay the previous user's writes under its own JWT. */
export function clearQueue() {
  write([]);
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
  if (item.kind === "task-postpone") {
    const { error } = await supabase
      .from("tasks")
      .update({ due_date: item.newDueDate })
      .eq("id", item.taskId);
    if (error) throw error;
    return;
  }
  if (item.kind === "journal-add") {
    const { error } = await supabase.from("plant_journals").insert({
      home_id:           item.homeId,
      inventory_item_id: item.inventoryItemId,
      subject:           item.subject,
      description:       item.description,
      image_url:         item.imageUrl,
      task_id:           item.taskId,
    });
    if (error) throw error;
    return;
  }
  if (item.kind === "ailment-link") {
    const { error } = await supabase.from("plant_instance_ailments").insert({
      home_id:          item.homeId,
      plant_instance_id: item.plantInstanceId,
      ailment_id:        item.ailmentId,
      linked_by:         item.linkedBy,
      status:            "active",
      photo_url:         item.photoUrl,
      notes:             item.notes,
    });
    if (error) throw error;
    return;
  }
  // Unknown kind — drop it so the queue doesn't loop forever on a stale shape.
}

let flushing = false;
let pendingFlush = false;

const MAX_ATTEMPTS = 8;

/** PostgREST/Postgres failures (RLS denial, row gone, constraint) carry a
 *  non-empty `code` or a 4xx status; network failures don't. Retrying a
 *  permanent failure forever is what wedged the whole queue behind one
 *  bad item. */
function isPermanentError(err: unknown): boolean {
  const e = err as { code?: unknown; status?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (typeof e.code === "string" && e.code.length > 0) return true;
  if (typeof e.status === "number" && e.status >= 400 && e.status < 500) return true;
  return false;
}

function bumpAttempt(id: string, err: unknown) {
  const message = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err);
  write(read().map((q) =>
    q.id === id ? { ...q, attempts: (q.attempts ?? 0) + 1, lastError: message } : q,
  ) as QueuedWrite[]);
}

// Transient-failure retry while already online: the `online` event won't
// fire again, so without this timer a single timeout stranded the queue
// until the user manually tapped the badge.
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 5_000;

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueue();
  }, retryDelayMs);
  retryDelayMs = Math.min(retryDelayMs * 2, 5 * 60_000);
}

/**
 * Replay every queued write. Permanently-failing items (RLS, deleted rows)
 * are dropped so they can't block the items behind them; network-shaped
 * failures stop the pass and retry with capped exponential backoff.
 * Returns the number of items successfully flushed.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) { pendingFlush = true; return 0; }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  flushing = true;
  let succeeded = 0;
  let transientFailure = false;
  try {
    const { data } = await supabase.auth.getSession();
    const currentUid = data.session?.user?.id ?? null;

    const queue = read();
    for (const item of queue) {
      // Never replay another account's write under this session's JWT
      // (audit-trail corruption at best, RLS failures at worst). Sign-out
      // clears the queue; this is the backstop for anything that survived.
      if (item.userId && currentUid && item.userId !== currentUid) {
        remove(item.id);
        continue;
      }
      try {
        await applyOne(item);
        remove(item.id);
        succeeded += 1;
      } catch (err) {
        if (isPermanentError(err) || (item.attempts ?? 0) + 1 >= MAX_ATTEMPTS) {
          console.warn("[offlineQueue] dropping permanently-failing item", item.kind, err);
          remove(item.id);
          continue;
        }
        bumpAttempt(item.id, err);
        transientFailure = true;
        // Network-shaped failure — stop the pass and retry later.
        break;
      }
    }
    if (succeeded > 0 || read().length === 0) retryDelayMs = 5_000;
  } finally {
    flushing = false;
    if (pendingFlush) {
      pendingFlush = false;
      // Schedule another pass so any items still in the queue get a chance.
      setTimeout(() => { void flushQueue(); }, 100);
    } else if (transientFailure) {
      scheduleRetry();
    }
  }
  return succeeded;
}

/**
 * Wire window `online` to auto-flush. Call once near the app root.
 */
export function bootstrapOfflineQueue(): () => void {
  if (typeof window === "undefined") return () => {};

  // Keep knownUserId current so enqueue() can stamp items synchronously.
  void supabase.auth.getSession().then(({ data }) => {
    knownUserId = data.session?.user?.id ?? null;
  });
  const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
    knownUserId = session?.user?.id ?? null;
  });

  const onOnline = () => { void flushQueue(); };
  window.addEventListener("online", onOnline);
  // Best-effort flush on startup in case items are stale from a previous session.
  if (navigator.onLine) {
    setTimeout(() => { void flushQueue(); }, 1500);
  }
  return () => {
    window.removeEventListener("online", onOnline);
    authSub.subscription.unsubscribe();
  };
}
