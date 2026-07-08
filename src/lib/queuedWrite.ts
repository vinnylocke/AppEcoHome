import { supabase } from "./supabase";
import { enqueue } from "./offlineQueue";
import { isOffline } from "../hooks/useOnline";

/**
 * Offline-aware single-row writes (offline-first Phase 3).
 *
 * Producers call these instead of `supabase.from(table)...` directly. When
 * offline (or on a network-shaped failure), the write is pushed onto the
 * offline queue and replayed on reconnect; the caller updates its local
 * state/cache optimistically so the change shows immediately. A PERMANENT
 * error (RLS denial, constraint, bad request) is NOT queued — it's returned
 * so the caller can surface it.
 *
 * Inserts must carry a client-generated `id` (uuid) in `payload` so a
 * double-replay upserts the same row instead of duplicating.
 */

export interface WriteResult {
  /** True when the write went to the offline queue (will sync later). */
  queued: boolean;
  /** Set only on a permanent (non-queued) failure. */
  error?: unknown;
}

/** PostgREST/Postgres permanent failures carry a `code` or 4xx `status`;
 *  network failures don't (mirror of offlineQueue's isPermanentError). */
function isPermanent(err: unknown): boolean {
  const e = err as { code?: unknown; status?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (typeof e.code === "string" && e.code.length > 0) return true;
  if (typeof e.status === "number" && e.status >= 400 && e.status < 500) return true;
  return false;
}

export async function insertOrQueue(
  table: string,
  payload: Record<string, unknown>,
  label?: string,
): Promise<WriteResult> {
  if (isOffline()) {
    enqueue({ kind: "db-write", table, op: "insert", payload, label });
    return { queued: true };
  }
  const { error } = await supabase.from(table).insert(payload);
  if (error) {
    if (isPermanent(error)) return { queued: false, error };
    enqueue({ kind: "db-write", table, op: "insert", payload, label });
    return { queued: true };
  }
  return { queued: false };
}

export async function updateOrQueue(
  table: string,
  patch: Record<string, unknown>,
  match: { column: string; value: string | number },
  label?: string,
): Promise<WriteResult> {
  if (isOffline()) {
    enqueue({ kind: "db-write", table, op: "update", payload: patch, match, label });
    return { queued: true };
  }
  const { error } = await supabase.from(table).update(patch).eq(match.column, match.value);
  if (error) {
    if (isPermanent(error)) return { queued: false, error };
    enqueue({ kind: "db-write", table, op: "update", payload: patch, match, label });
    return { queued: true };
  }
  return { queued: false };
}

export async function deleteOrQueue(
  table: string,
  match: { column: string; value: string | number },
  label?: string,
): Promise<WriteResult> {
  if (isOffline()) {
    enqueue({ kind: "db-write", table, op: "delete", match, label });
    return { queued: true };
  }
  const { error } = await supabase.from(table).delete().eq(match.column, match.value);
  if (error) {
    if (isPermanent(error)) return { queued: false, error };
    enqueue({ kind: "db-write", table, op: "delete", match, label });
    return { queued: true };
  }
  return { queued: false };
}
