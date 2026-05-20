# Error Page

> The top-level error boundary fallback. Renders when an uncaught React error bubbles up. Shows a friendly message, a short error ID for support tickets, and quick actions: Go Back, Reload, Send Report, Clear Cache.

**Source file:** `src/components/ErrorPage.tsx`

---

## Quick Summary

Catch-all UI for crashes. Generates a 6-character error ID like `RZ-VT93G2` from the error message + timestamp so users have something concrete to quote when contacting support. Collects device info (user agent, screen, online state, URL, timestamp) for the report. Sends to a `report-error` edge function. Self-resets the error state if user clicks Reload.

---

## Role 1 — Technical Reference

### Component graph

```
ErrorPage
├── AlertTriangle icon hero
├── "Something went wrong" headline
├── Error ID chip (copy button)
├── Action buttons
│   ├── Go Back
│   ├── Reload
│   ├── Send Report
│   └── Clear Cache (destructive)
└── Sent / Failed feedback states
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `error` | `Error?` | The thrown error |
| `appVersion` | `string?` | For the report |

### `errorId` generation

```ts
hash = (message + Date.now()) → base36 → "RZ-XXXXXX"
```

Short, opaque, but reproducible during a single render.

### `collectDeviceInfo()`

```ts
{
  userAgent, platform, screenSize, language,
  onLine, pageUrl, timestamp,
}
```

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `report-error` | Forwards the error + device info to ops |

### Clear cache action

Wipes `localStorage`, `sessionStorage`, and unregisters the service worker. Hard reload.

### Data flow — write paths

- `report-error` edge fn invocation only.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| Send fails | "Failed — try again" inline |
| Already sent | "Report sent" success state |

### Performance

- Static UI; only fetch is the report submission.

### Linked storage buckets

None.

### Sentry integration (typical)

`ErrorPage` is usually wrapped by a global ErrorBoundary in App.tsx; Sentry receives the same error automatically via boundary integration.

---

## Role 2 — Expert Gardener's Guide

### Why see this page

Something crashed. Rare but possible — bad data, race condition, browser quirk.

The page gives you a path forward:
- **Go Back** — try the previous screen.
- **Reload** — clear in-memory state, fetch fresh.
- **Send Report** — help us fix it (please do!).
- **Clear Cache** — nuclear option; wipes local state.

### Every flow

#### 1. Note the error ID

- "RZ-XXXXXX" — copy if contacting support.

#### 2. Try the soft fixes first

- Go Back, then Reload.

#### 3. Send the report

- We get a copy of the error + device info.

#### 4. Clear Cache as last resort

- Wipes all local data. You'll have to log in again. Use only when stuck.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Clearing cache immediately.** It's the nuclear option — try Reload first.
- **Not sending the report.** Reports drive bug fixes. Send them.

### Recommended workflows

- Note error ID → Reload → if persists, Send Report + Contact Support with the ID.

### What to do if something looks wrong

- **Even ErrorPage crashes:** browser console may show why. Hard refresh.

---

## Related reference files

- [Contact Support Modal](../08-modals-and-overlays/18-contact-support.md)
- [Error Handling (cross-cutting)](../99-cross-cutting/20-error-handling.md)

## Code references for ongoing maintenance

- `src/components/ErrorPage.tsx`
- `src/lib/errorHandler.ts` — Logger / Sentry wiring
- `supabase/functions/report-error/index.ts`
