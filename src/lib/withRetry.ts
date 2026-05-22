// Retry + timeout + online-aware wrapper for transient-failure-prone
// async calls (typically Supabase reads).
//
// USE ONLY FOR IDEMPOTENT OPERATIONS — reads, fetches, RPC queries with
// no side effects. Wrapping a write would risk double-writes on retry.
//
// Behaviour:
//   - Races the inner function against a `timeoutMs` deadline.
//   - On throw OR Supabase-shaped `{ error }` result, waits with
//     exponential backoff (300ms × 2^attempt by default) and retries
//     up to `retries` times.
//   - When the device is offline (`navigator.onLine === false`), waits
//     for the next `online` event before each attempt instead of
//     burning a retry on a dead network.
//   - Returns whatever the inner function returned on success — same
//     shape, so callers don't have to change.

import { Logger } from "./errorHandler";

export interface WithRetryOptions {
  /** Max number of retry attempts AFTER the first call. Defaults to 2. */
  retries?: number;
  /** Base delay between attempts in ms. Doubles each retry. Defaults to 300. */
  baseDelayMs?: number;
  /** Per-attempt timeout. Defaults to 10s. */
  timeoutMs?: number;
  /** Tag for logging — appears alongside any retry / failure messages. */
  label?: string;
}

const SLEEP = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Returns true if `navigator.onLine` is unambiguously false. SSR /
 * jsdom environments without the property are treated as online so we
 * don't deadlock in tests.
 */
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Wait for the next `online` event, with a safety timeout so we don't
 * wait forever in environments where the event never fires.
 */
function waitForOnline(safetyMs = 30_000): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      window.removeEventListener("online", settle);
      resolve();
    };
    window.addEventListener("online", settle, { once: true });
    setTimeout(settle, safetyMs);
  });
}

/**
 * Race a promise against a timeout. The timeout rejection includes the
 * label so logs are easier to follow.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Detects whether a Supabase-shaped result `{ data, error }` indicates
 * a transient error worth retrying. We treat any non-null `error` as
 * retryable — Supabase JS doesn't classify errors at this layer, and
 * the worst case of retrying a permanent error is a slightly slower
 * permanent failure.
 */
function looksLikeSupabaseError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    (value as { error?: unknown }).error != null
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOptions = {},
): Promise<T> {
  const {
    retries = 2,
    baseDelayMs = 300,
    timeoutMs = 10_000,
    label = "withRetry",
  } = opts;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (isOffline()) await waitForOnline();
    try {
      const result = await withTimeout(fn(), timeoutMs, label);
      if (looksLikeSupabaseError(result)) {
        // Supabase returned an error result. Treat as transient until
        // we've burned our retries.
        lastError = (result as { error?: unknown }).error;
        if (attempt === retries) return result;
        const delay = baseDelayMs * Math.pow(2, attempt);
        Logger.error(
          `${label}: result error — retry ${attempt + 1}/${retries} in ${delay}ms`,
          lastError,
        );
        await SLEEP(delay);
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      Logger.error(
        `${label}: threw — retry ${attempt + 1}/${retries} in ${delay}ms`,
        err,
      );
      await SLEEP(delay);
    }
  }
  // Defensive — the loop returns or throws on every path; this line is
  // unreachable but keeps TS narrowing happy.
  throw lastError ?? new Error(`${label}: exhausted retries with no error`);
}
