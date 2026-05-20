# Deployment Pipeline — `npm run deploy`, Vercel, Maintenance Mode

> Rhozly deploys via a single command that orchestrates: maintenance flag ON → push DB migrations → Vercel deploy → maintenance flag OFF. Document of record: `docs/deployment.md`.

---

## Quick Summary

```
npm run deploy
├── 1. maintenance:on  (sets app_settings.maintenance_mode = true)
├── 2. supabase db push (apply pending migrations)
├── 3. vercel deploy --prod
└── 4. maintenance:off (sets maintenance_mode = false)
```

If any step fails mid-way, `npm run maintenance:off` is the emergency switch to bring the app back online.

---

## Role 1 — Technical Reference

### Scripts

| Script | What it does |
|--------|--------------|
| `npm run deploy` | Full pipeline above |
| `npm run maintenance:on` | Sets `app_settings.maintenance_mode = true` |
| `npm run maintenance:off` | Sets `app_settings.maintenance_mode = false` |

### `app_settings` table

```ts
{
  id (singleton row), maintenance_mode: bool,
  maintenance_message: text?,
  updated_at,
}
```

### Boot check

On app load, `src/App.tsx` reads `app_settings`. If `maintenance_mode = true`, renders [MaintenanceScreen](../09-persistent-ui/09-maintenance-screen.md) instead of the main app.

### Polling

While in maintenance, the screen polls every ~30s to detect flip-off → auto-reloads.

### Vercel config

- `vercel.json` or `vercel.ts` defines build + framework.
- Auto-builds on push to `main` (if connected).
- `vercel deploy --prod` invoked from the deploy script.

### Migration safety

Migrations should be backwards-compatible during the maintenance window:
- ADD COLUMN — fine.
- DROP COLUMN — only after deploying code that doesn't reference it.
- Constraint changes — verify with `supabase migration up` locally first.

### Rollback

- Vercel: instant rollback via Vercel UI → "Promote previous deploy".
- DB: write a forward migration that undoes the change; never rely on schema rollback.

### Pre-flight checklist

Per `docs/deployment.md`:
1. Run `npx tsc --noEmit` clean.
2. Run unit + Deno + Playwright tests.
3. Update `release-notes.json` if user-visible.
4. Commit + push.
5. `npm run deploy`.

### Service key

`.env` holds `SUPABASE_SERVICE_ROLE_KEY` — required for maintenance script. Never commit.

---

## Role 2 — Expert Gardener's Guide

### Why a maintenance window

DB migrations + Vercel cutover take 30-60 seconds. Maintenance mode prevents users from hitting half-migrated state.

### Implications

- A maintenance screen during deploy is normal.
- The maintenance message can be customised per deploy ("we're rolling out the new Planner").

---

## Related reference files

- [Maintenance Screen](../09-persistent-ui/09-maintenance-screen.md)
- [Release Notes Pipeline](./32-release-notes.md)

## Code references for ongoing maintenance

- `package.json` → scripts
- `scripts/deploy.mjs`, `scripts/maintenance-on.mjs`, `scripts/maintenance-off.mjs`
- `docs/deployment.md`
- `vercel.json` or `vercel.ts`
