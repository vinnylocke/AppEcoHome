# Plan — Sentry Error Monitoring for Edge Functions

## Goal

Capture unhandled exceptions from all 42 Supabase Edge Functions in Sentry, using
the same project DSN already configured for the frontend. Cron-triggered functions
are the highest priority because failures there are completely silent today.

---

## Cron-scheduled functions (10) — silent failures, highest priority

| Cron job name | Function |
|---|---|
| `run-automations-hourly` | `run-automations` |
| `sync-weather-daily` | `sync-weather` |
| `daily-8am-batch` | `daily-batch-notifications` |
| `generate-tasks-daily` | `generate-tasks` |
| `pattern-scan-6h` | `pattern-scan` |
| `pattern-evaluate-6h` | `pattern-evaluate` |
| `refresh-behaviour-summary-nightly` | `refresh-behaviour-summary` |
| `purge-species-cache-daily` | `purge-stale-species-cache` |
| `weekly-digest-monday` | `weekly-digest` |
| `garden-reports-monthly` | `garden-reports` |

---

## Approach

**No SDK — lightweight Envelope API.** Pulling in `@sentry/deno` introduces a large
dependency with uncertain compatibility in Supabase's Deno runtime. Instead,
`_shared/sentry.ts` posts directly to Sentry's HTTP Envelope API — ~50 lines, zero
dependencies, always works.

The DSN is already in `.env` as `VITE_SENTRY_DSN`. Edge functions read env vars via
`Deno.env.get()`, so the same value needs to be added as a **Supabase secret** named
`SENTRY_DSN` (one-time step by the developer before deploying).

---

## Step 1 — Add Supabase secret (developer action, before deploying)

```bash
supabase secrets set SENTRY_DSN="https://36b6725e951a46e72ca56de7884dcbfe@o4511145958047744.ingest.de.sentry.io/4511146307747920"
```

---

## Step 2 — Create `supabase/functions/_shared/sentry.ts`

Parses the DSN, builds a minimal Sentry Envelope, posts it fire-and-forget.
Tags every event with `fn` (function name) and `source: "edge"` so you can filter
in the Sentry dashboard to separate edge errors from frontend errors.

```typescript
const _DSN = Deno.env.get("SENTRY_DSN") ?? "";

interface Parsed { key: string; host: string; projectId: string }

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

  const envelope = [
    JSON.stringify({ sent_at: new Date().toISOString(), dsn: _DSN }),
    JSON.stringify({ type: "event", length: JSON.stringify(event).length }),
    JSON.stringify(event),
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
```

---

## Step 3 — Update all 42 edge functions

Every function already has a top-level `try/catch`. The change is two lines per function:

```typescript
// 1. Add import at top (alongside existing logger import)
import { captureException } from "../_shared/sentry.ts";

// 2. Call in the catch block, before returning
} catch (err) {
  await captureException(FN, err, { /* relevant context, e.g. homeId */ });
  // existing error logging / response stays unchanged
}
```

For functions that don't define a `FN` constant, use the function folder name as a
string literal.

### Functions to update

**Cron (10):** run-automations, sync-weather, daily-batch-notifications,
generate-tasks, pattern-scan, pattern-evaluate, refresh-behaviour-summary,
purge-stale-species-cache, weekly-digest, garden-reports

**User-triggered (32):** analyse-weather, app-help, contact-support, delete-account,
generate-ailment-suggestions, generate-guide, generate-landscape-plan,
generate-swipe-plants, home-dashboard-stats, home-location-details, image-proxy,
integrations-dead-mans-switch, integrations-ecowitt-connect, integrations-ecowitt-poll,
integrations-ecowitt-webhook, integrations-ewelink-connect, integrations-ewelink-control,
integrations-ewelink-state, integrations-readings-query, perenual-proxy, plant-doctor,
plant-doctor-ai, plant-image-search, predict-yield, push-webhook, report-error,
scan-area, search-plants-ai, smart-plant-scheduler, update-plant-states,
verdantly-search, visualiser-analyse

---

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/_shared/sentry.ts` | New — lightweight Sentry envelope sender |
| `supabase/functions/*/index.ts` (×42) | Add import + `await captureException(...)` in catch |

---

## What you'll see in Sentry

- Each error is tagged `fn:<function-name>` and `source:edge`
- Use saved searches like `source:edge` or `fn:run-automations` to focus on edge errors
- Set up a Sentry alert rule: **Issue is first seen** → email / Slack — this fires the
  moment a new error appears in any edge function
- For cron functions, consider a **Cron Monitor** in Sentry (free tier) which alerts
  if the function stops checking in — complements exception alerts

---

## Risks / notes

- `captureException` is fire-and-forget with a 3 s timeout. If Sentry is unreachable,
  the call silently fails and the function continues normally.
- `SENTRY_DSN` being unset is also a no-op — safe to deploy before adding the secret.
- Errors already handled internally (e.g. a single home failing while others succeed)
  should NOT be passed to `captureException` unless they're unexpected. Use judgement
  inside each function for caught-and-handled sub-errors.
