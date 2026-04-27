/**
 * Structured JSON logger for Supabase Edge Functions.
 *
 * Every call emits a single JSON line to stdout/stderr so Supabase Log Search
 * can filter by any field using key:value syntax, e.g.:
 *   fn:plant-doctor event:model_success
 *   fn:generate-landscape-plan event:preferences_injected
 *
 * Keep payload values primitive (string | number | boolean | null) or plain
 * arrays/objects — no class instances, no circular refs.
 */

export type LogPayload = Record<string, unknown>;

function emit(
  level: "log" | "warn" | "error",
  fn: string,
  event: string,
  payload?: LogPayload,
): void {
  const line = JSON.stringify({
    fn,
    event,
    ts: new Date().toISOString(),
    ...(payload ?? {}),
  });
  console[level](line);
}

/** Informational event — normal operation. */
export const log = (fn: string, event: string, payload?: LogPayload) =>
  emit("log", fn, event, payload);

/** Non-fatal warning — degraded path taken (e.g. model fallback). */
export const warn = (fn: string, event: string, payload?: LogPayload) =>
  emit("warn", fn, event, payload);

/** Fatal or caught error — always include `error` field with message string. */
export const error = (fn: string, event: string, payload?: LogPayload) =>
  emit("error", fn, event, payload);
