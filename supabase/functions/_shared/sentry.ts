/**
 * Lightweight Sentry error reporter for Supabase Edge Functions.
 *
 * Posts directly to the Sentry HTTP Envelope API — no SDK dependency.
 * Set the SENTRY_DSN secret in your Supabase project to enable reporting.
 * If the secret is absent or Sentry is unreachable, this is a silent no-op.
 *
 * Usage:
 *   import { captureException } from "../_shared/sentry.ts";
 *   await captureException("my-function", err, { homeId, userId });
 */

const _DSN = Deno.env.get("SENTRY_DSN") ?? "";

interface Parsed {
  key: string;
  host: string;
  projectId: string;
}

function parseDsn(dsn: string): Parsed | null {
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  return m ? { key: m[1], host: m[2], projectId: m[3] } : null;
}

export async function captureException(
  fn: string,
  err: unknown,
  extras?: Record<string, unknown>,
): Promise<void> {
  if (!_DSN) return;
  const p = parseDsn(_DSN);
  if (!p) return;

  const message = err instanceof Error ? err.message : String(err);
  const stack   = err instanceof Error ? (err.stack ?? "") : "";

  const event = {
    event_id:  crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    level:     "error",
    platform:  "javascript",
    tags:      { fn, source: "edge" },
    extra:     extras ?? {},
    exception: {
      values: [{
        type:  err instanceof Error ? err.constructor.name : "Error",
        value: message,
        stacktrace: {
          frames: stack
            .split("\n")
            .slice(1)
            .filter(Boolean)
            .map((l) => ({ filename: "edge-fn", function: l.trim() })),
        },
      }],
    },
  };

  const eventJson = JSON.stringify(event);
  const envelope = [
    JSON.stringify({ sent_at: new Date().toISOString(), dsn: _DSN }),
    JSON.stringify({ type: "event", length: eventJson.length }),
    eventJson,
  ].join("\n");

  try {
    await fetch(`https://${p.host}/api/${p.projectId}/envelope/`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7,sentry_key=${p.key},sentry_client=rhozly-edge/1.0`,
      },
      body:   envelope,
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Never let Sentry reporting break the function
  }
}
