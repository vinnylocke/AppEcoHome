# Error Handling — Sentry, report-error, ErrorPage

> Three layers: in-component `try/catch` + `toast.error`, the `Logger` wrapper that pushes structured logs to Sentry, and the top-level React `ErrorBoundary` that renders `ErrorPage` with the `report-error` edge function.

---

## Quick Summary

```
component error ──► toast.error("user-friendly")
                ──► Logger.error(message, error, context, userMsg)
                      │
                      ├── console.error (dev)
                      └── Sentry capture (prod)

uncaught render error ──► React ErrorBoundary ──► ErrorPage
                                                    │
                                                    └── report-error edge fn (when user taps Send)
```

---

## Role 1 — Technical Reference

### `Logger` (in `src/lib/errorHandler.ts`)

```ts
Logger.error(message: string, error?: any, context?: Record<string, any>, userMessage?: string);
Logger.warn(message: string, context?: Record<string, any>);
Logger.info(message: string, context?: Record<string, any>);
```

- Always logs to console.
- In production, captures to Sentry with context.
- If `userMessage` passed, also fires `toast.error(userMessage)`.

### Pattern

```ts
try {
  await supabase.from("inventory_items").insert(...);
} catch (err: any) {
  Logger.error(
    "Failed to add plant",
    err,
    { homeId, plantName },
    "Could not add plant — please try again."
  );
}
```

### React ErrorBoundary

`src/App.tsx` wraps the root tree in a global boundary that renders [ErrorPage](../09-persistent-ui/08-error-page.md) on uncaught errors.

Per-modal boundaries exist for surfaces that should fail soft (e.g. `NoteBoundary` in [Release Notes Modal](../08-modals-and-overlays/19-release-notes.md)).

### `report-error` edge function

Receives:
```ts
{
  error_id, message, stack?, device_info,
  user_id?, home_id?,
}
```

Forwards to ops via email or internal channel.

### Sentry integration

Configured in `src/main.tsx` (DSN from env). User context attached on sign-in.

### Error ID generation

`ErrorPage` generates a short `RZ-XXXXXX` id from `error.message + Date.now()` — user-readable for support tickets.

### Categories

| Class | Handling |
|-------|----------|
| Network (4xx) | Toast + retry option |
| Network (5xx / timeout) | Toast + Sentry |
| RLS denial | Toast "you don't have permission" |
| Unexpected (uncaught) | ErrorBoundary → ErrorPage |
| Hook violation | ErrorBoundary catches |

### Plugin-level errors

Hook violations (e.g. `useEffect` dependency issues) crash to ErrorPage. Avoid by using lint rules + tests.

---

## Role 2 — Expert Gardener's Guide

### Why this matters

When something breaks, you should see a user-friendly message (toast) most of the time, and a Send Report button (ErrorPage) for catastrophic crashes. Behind the scenes, devs get structured logs to debug.

### What to do as a user

- **Toast appears:** read it; usually self-explanatory.
- **ErrorPage:** copy the RZ-XXXXXX id, tap Send Report, optionally Contact Support with the id.

---

## Related reference files

- [Error Page](../09-persistent-ui/08-error-page.md)
- [Contact Support Modal](../08-modals-and-overlays/18-contact-support.md)
- [Toaster](../09-persistent-ui/10-toaster.md)

## Code references for ongoing maintenance

- `src/lib/errorHandler.ts`
- `src/main.tsx` — Sentry init
- `supabase/functions/report-error/index.ts`
