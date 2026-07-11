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
    })
  // Generic single-row write (offline-first Phase 3). Collapses the ~35
  // single-row-idempotent offline writes (task create/edit, note, plant
  // edit/archive, instance edit, shopping, areas/locations edit, garden
  // shapes, todos, lux) into ONE replayable shape instead of a bespoke kind
  // each. RLS enforces safety server-side on replay. `op`:
  //   insert → supabase.from(table).insert(payload)
  //   update → supabase.from(table).update(payload).eq(match.column, match.value)
  //   delete → supabase.from(table).delete().eq(match.column, match.value)
  // Use only for idempotent rows: an insert must carry a client-generated id
  // (uuid) so a double-replay upserts the same row rather than duplicating.
  | (BaseQueued & {
      kind: "db-write";
      table: string;
      op: "insert" | "update" | "delete";
      payload?: Record<string, unknown>;
      match?: { column: string; value: string | number };
      /** Human label for the queued-count UI / debugging. */
      label?: string;
    })
  // Resolve-on-flush task dependency link (offline-first). Linking a task to
  // a ghost occurrence is race-prone if we materialise the ghost with our own
  // client uuid offline: the `generate-tasks` cron may materialise the SAME
  // (blueprint_id, due_date) server-side first, and our insert would then trip
  // `unique_blueprint_date` and dead-letter, orphaning the dependency. This
  // kind defers everything to flush time: it resolves the real target row
  // (the cron's, if it exists; otherwise it materialises one), then inserts
  // the dependency against whichever id is real. `createdTaskId` is the
  // already-queued task we control; only the TARGET may need resolving.
  | (BaseQueued & {
      kind: "task-dep-link";
      createdTaskId: string;
      orientation: "waiting_on" | "blocks";
      /** Concrete target (target was already a physical task). */
      targetTaskId?: string;
      /** Ghost target to resolve/materialise at flush. */
      targetGhost?: {
        home_id: string;
        blueprint_id: string;
        due_date: string;
        title: string;
        description: string | null;
        type: string;
        location_id: string | null;
        area_id: string | null;
        plan_id: string | null;
        inventory_item_ids: string[];
      };
      label?: string;
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
  // If we queued while (nominally) ONLINE — a transient / lie-fi failure — the
  // `online` event won't fire (it only triggers on an offline→online
  // transition), so nothing would flush this until the next app start / manual
  // tap. Kick a debounced retry so the write isn't stranded (bug-audit
  // 2026-07-10 #20). scheduleRetry() is a no-op if a retry is already pending.
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    scheduleRetry();
  }
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
  if (item.kind === "db-write") {
    if (item.op === "insert") {
      // Upsert (not plain insert) so a double-replay of a client-id'd row is
      // idempotent instead of a duplicate/PK-conflict.
      const { error } = await supabase.from(item.table).upsert(item.payload ?? {});
      if (error) throw error;
      return;
    }
    if (item.op === "update") {
      if (!item.match) return; // malformed — drop silently
      const { error } = await supabase
        .from(item.table)
        .update(item.payload ?? {})
        .eq(item.match.column, item.match.value);
      if (error) throw error;
      return;
    }
    if (item.op === "delete") {
      if (!item.match) return;
      const { error } = await supabase
        .from(item.table)
        .delete()
        .eq(item.match.column, item.match.value);
      if (error) throw error;
      return;
    }
    return;
  }
  if (item.kind === "task-dep-link") {
    // Resolve the real target id at flush time (race-free).
    let targetId = item.targetTaskId ?? null;
    if (!targetId && item.targetGhost) {
      const g = item.targetGhost;
      // Did the ghost already become a real row — materialised by us in a
      // prior partial flush, or by the generate-tasks cron server-side?
      const { data: existing, error: findErr } = await supabase
        .from("tasks")
        .select("id")
        .eq("blueprint_id", g.blueprint_id)
        .eq("due_date", g.due_date)
        .neq("status", "Skipped")
        .limit(1);
      if (findErr) throw findErr;
      if (existing && existing.length > 0) {
        targetId = existing[0].id;
      } else {
        // Not yet materialised anywhere — create it now. Upsert on the
        // (blueprint_id, due_date) unique constraint so a concurrent cron
        // insert can't turn this into a hard duplicate-key failure; the
        // returned row is whichever one now exists.
        const { data: inserted, error: insErr } = await supabase
          .from("tasks")
          .upsert(
            {
              home_id: g.home_id,
              blueprint_id: g.blueprint_id,
              title: g.title,
              description: g.description,
              type: g.type,
              due_date: g.due_date,
              status: "Pending",
              location_id: g.location_id,
              area_id: g.area_id,
              plan_id: g.plan_id,
              inventory_item_ids: g.inventory_item_ids,
            },
            { onConflict: "blueprint_id,due_date" },
          )
          .select("id")
          .single();
        if (insErr) throw insErr;
        targetId = inserted?.id ?? null;
      }
    }
    if (!targetId) return; // malformed — drop
    const payload =
      item.orientation === "waiting_on"
        ? { task_id: item.createdTaskId, depends_on_task_id: targetId }
        : { task_id: targetId, depends_on_task_id: item.createdTaskId };
    const { error } = await supabase.from("task_dependencies").insert(payload);
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
