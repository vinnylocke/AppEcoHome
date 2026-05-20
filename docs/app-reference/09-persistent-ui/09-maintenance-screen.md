# Maintenance Screen

> Full-screen "we'll be right back" message shown when the app is in maintenance mode during a deploy. Read from a Supabase config flag at boot; once disabled, the app reloads automatically.

**Source file:** `src/components/MaintenanceScreen.tsx`
**Deploy doc:** `docs/deployment.md`

---

## Quick Summary

A friendly maintenance page with the Rhozly logo, a wrench icon, and a configurable message. Rendered when the app's maintenance flag is on (during `npm run deploy`'s migration + Vercel deploy window). Auto-reloads when the flag flips off — poll-based at ~30 s intervals.

---

## Role 1 — Technical Reference

### Component graph

```
MaintenanceScreen
├── Logo card
├── Headline + body copy
├── "Maintenance in progress" pill
└── "Your data is safe" footnote
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `message` | `string \| null` | Override copy |

### Maintenance flag source

Typically `app_settings.maintenance_mode` bool + `maintenance_message` text. Read at boot by `src/App.tsx` (or `src/main.tsx`). Toggled via the `npm run maintenance:on` / `npm run maintenance:off` scripts.

### Boot wiring (typical)

```ts
// On app load:
const { data } = await supabase.from("app_settings").select("*").single();
if (data?.maintenance_mode) {
  render(<MaintenanceScreen message={data.maintenance_message} />);
} else {
  render(<App />);
}
// Plus a poll every 30s while in maintenance to detect flip-off
```

### Data flow

Read-only.

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None — poll-based.

### Tier gating

None — shows to every user.

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| Flag read fails | App proceeds (assume not in maintenance) |

### Performance

- Lightweight static UI.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this screen

Rhozly is mid-deploy. Most deploys take 30-60 seconds. Migrations may take longer. The screen tells you "wait + your data is safe".

### Every flow

#### 1. Wait

- Page auto-reloads once maintenance flips off.

#### 2. Manual reload

- Refresh the browser if impatient — if the flag is still on, the maintenance screen reappears.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Panicking that data is lost.** It isn't. Migrations + new code are loading.

### Recommended workflows

- Grab a coffee. Refresh in 2 minutes.

### What to do if something looks wrong

- **Stuck on maintenance for > 10 minutes:** the deploy may have failed mid-way; admins should run `npm run maintenance:off`.

---

## Related reference files

- [Update Banner](./06-update-banner.md)
- [Deployment Pipeline (cross-cutting)](../99-cross-cutting/31-deployment.md)

## Code references for ongoing maintenance

- `src/components/MaintenanceScreen.tsx`
- `scripts/maintenance-on.mjs` + `scripts/maintenance-off.mjs`
- `supabase/migrations/*_app_settings.sql`
