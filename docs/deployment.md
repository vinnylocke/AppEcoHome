# Rhozly — Deployment Guide

## Overview

Every production deployment follows the same automated pipeline:

1. **Maintenance mode ON** — users see a "We'll be right back" screen (real-time, no refresh needed)
2. **Database migrations pushed** — `supabase db push`
3. **Frontend deployed to Vercel** — `vercel --prod` (blocks until live)
4. **Maintenance mode OFF** — active users are automatically reloaded onto the new version

---

## Prerequisites (one-time setup)

### Environment variables
Add both of these to `.env` in the project root:

```
SUPABASE_PROD_URL=https://yiuuzlfhtsxbspdyibam.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Note: `VITE_SUPABASE_URL` points to localhost for local dev — the deploy script uses `SUPABASE_PROD_URL` to ensure it always targets production.

The service role key is in **Supabase Dashboard → Settings → API → service_role (secret)**. Never commit this key.

### Vercel CLI
```bash
npm install -g vercel
vercel login
vercel link   # run once from the project root to link to the Rhozly Vercel project
```

### Supabase CLI
Must be installed and authenticated. Verify with:
```bash
supabase --version
```

---

## Standard deploy

### Step 0: Write release notes (required before every deploy)

Open `release-notes.json` in the project root and document what changed in this release:

```json
[
  { "label": "New", "items": ["Feature you added"] },
  { "label": "Fixed", "items": ["Bug you fixed"] },
  { "label": "Improved", "items": ["Thing you improved"] }
]
```

Supported labels: `New`, `Fixed`, `Improved`, `Removed`. Leave as `[]` for hotfixes — a warning will print but the deploy will continue. The deploy script automatically inserts the notes into the `release_notes` table and resets `release-notes.json` to `[]` after a successful deploy. Users will see the notes in a modal on their next visit.

### Step 1: Deploy

```bash
npm run deploy
```

Optionally provide a custom maintenance message:

```bash
node scripts/deploy.mjs "Deploying care schedule improvements — back in ~2 mins!"
```

### What happens step by step

| Step | Command | What it does |
|---|---|---|
| 1 | `PATCH app_config` (service role) | Sets `maintenance_mode.enabled = true` — all active users see maintenance screen within seconds |
| 2 | `supabase db push` | Applies any pending SQL migrations to production |
| 3 | `vercel --prod` | Builds and deploys the frontend; script waits for Vercel to confirm the deployment is live |
| 4 | `PATCH app_config` (service role) | Sets `maintenance_mode.enabled = false` — users receive a Realtime event and are automatically reloaded |

---

## If the deploy fails

The script exits immediately if any step fails, leaving maintenance mode **ON** to protect users from a broken state. Fix the underlying issue (migration error, build failure, etc.), then:

```bash
# Turn maintenance off manually once the issue is resolved
npm run maintenance:off
```

Then re-run `npm run deploy` once the fix is ready.

---

## Database-only changes (no frontend deploy)

If you only have a migration to apply (no frontend changes):

```bash
node scripts/deploy.mjs  # runs full pipeline — Vercel no-op deploy is fast (~30s)
```

Or manually:

```bash
# Set maintenance on
# Then:
supabase db push
# Set maintenance off via: npm run maintenance:off
```

---

## How the maintenance screen works

- **`app_config` table** — a single Postgres table with a `maintenance_mode` row (`{ enabled: boolean, message: string | null }`)
- **Client** — `useMaintenanceMode` hook subscribes to Realtime changes on this row
- **On enable** — `MaintenanceScreen` is rendered before auth and the router, so all users see it regardless of login state
- **On disable** — the hook activates any waiting service worker (new code), then reloads the page; users land on the freshly deployed version automatically
- **Emergency off** — if the Realtime event doesn't reach a user, refreshing the page will also clear the maintenance screen (initial fetch in the hook)

---

## Checklist before deploying

- [ ] All local changes committed and pushed to `main`
- [ ] `npm run test:unit` passes
- [ ] Migration files (if any) created in `supabase/migrations/` with correct timestamp naming (`YYYYMMDDHHMMSS_description.sql`)
- [ ] Migration tested locally (`supabase db query --local --file ...`)
- [ ] Feature tested in the browser against local Supabase
- [ ] `.env` contains `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Vercel CLI linked to project (`vercel link`)

---

## Rollback

Vercel keeps all previous deployments. To roll back the frontend:

```bash
vercel rollback
```

To roll back a database migration, write a new down-migration SQL file and push it as a new migration. Never delete migration files that have been applied to production.
