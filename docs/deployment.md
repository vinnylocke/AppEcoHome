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

### Step 0: Release notes (maintained continuously, not just at deploy time)

`release-notes.json` in the project root is a living document. **Update it as each fix, feature, or improvement is made** — not in a batch just before deploying. This way the notes are always accurate and ready when a deploy comes around.

```json
[
  { "label": "New", "items": ["Feature you added"] },
  { "label": "Fixed", "items": ["Bug you fixed"] },
  { "label": "Improved", "items": ["Thing you improved"] }
]
```

Supported labels: `New`, `Fixed`, `Improved`, `Removed`.

**Workflow:**
- After implementing each fix/feature/improvement, append the relevant item to `release-notes.json` immediately.
- At deploy time, review what's accumulated, confirm the notes look right, then deploy.
- The deploy script automatically inserts the notes into the `release_notes` table and resets `release-notes.json` to `[]` after a successful deploy — ready for the next release.
- Leave as `[]` only for genuine hotfixes with no user-visible change — a warning will print but the deploy will continue.

Users will see the notes in a modal on their next visit.

### Step 1: Commit your changes

Stage and commit all changed files. The deploy script reads from disk, not from git, but committing first keeps history accurate and rollbacks clean. **Don't push yet** — push *after* the deploy (Step 3) so the push also captures the `chore(release)` commit the script makes when it resets `release-notes.json`.

```bash
git add <files>          # stage specific files — avoid git add -A to prevent accidental includes
git commit -m "feat/fix/chore: description"
```

### Step 2: Count your changes and deploy

**Every distinct fix, feature, or improvement counts as one minor version increment.** Pass `--bump N` where N is the number of changes in this release. This means the minor version acts as a rough indicator of how much went into each release — a release with 4 changes bumps by 4.

| Release contains | Command |
|---|---|
| 1 fix / feature / improvement | `npm run deploy` |
| 3 fixes in one release | `node scripts/deploy.mjs --bump 3` |
| Major milestone / breaking change | `node scripts/deploy.mjs --bump-major` |

Optionally add a custom maintenance message as the first non-flag argument:

```bash
node scripts/deploy.mjs --bump 2 "Deploying care schedule improvements — back in ~2 mins!"
```

### Step 3: Push to `main` (always)

**Every deploy finishes with a push to `main` — this is the default, not an optional extra.** Production is built from the working tree, so the remote must be brought back in line afterwards or history and rollbacks drift from what's actually live.

```bash
git push origin main
```

Push *after* the deploy so it includes both your Step 1 commit **and** the `chore(release)` commit the script makes when it resets `release-notes.json`. **A deploy is not considered complete until `main` is pushed.**

### What the deploy script does step by step

| Step | Command | What it does |
|---|---|---|
| 1 | `PATCH app_config` (service role) | Sets `maintenance_mode.enabled = true` — all active users see the maintenance screen within seconds |
| 2 | `supabase db push --include-all` | Applies any pending SQL migrations to production |
| 3 | `supabase functions deploy` | Deploys all edge functions |
| 4 | `vercel --prod` | Builds and deploys the frontend; waits for Vercel to confirm the deployment is live |
| 5 | Save release notes + reset `release-notes.json` | Inserts the notes into `release_notes`, bumps the app version, resets the file to `[]`, and commits that as `chore(release): … [skip ci]` |
| 6 | `PATCH app_config` (service role) | Sets `maintenance_mode.enabled = false` — users get a Realtime event and auto-reload |

> The script does **not** push to git. That's **Step 3** above — run it after the script returns so the remote matches production.

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

- [ ] All local changes committed (Step 1)
- [ ] `npm run test:unit` passes
- [ ] Migration files (if any) created in `supabase/migrations/` with correct timestamp naming (`YYYYMMDDHHMMSS_description.sql`)
- [ ] Migration tested locally (`supabase db query --local --file ...`)
- [ ] Feature tested in the browser against local Supabase
- [ ] `.env` contains `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Vercel CLI linked to project (`vercel link`)

## After deploying (required)

- [ ] `git push origin main` — **every deploy ends with a push** so the remote matches production (includes the script's `chore(release)` commit)

---

## Rollback

Vercel keeps all previous deployments. To roll back the frontend:

```bash
vercel rollback
```

To roll back a database migration, write a new down-migration SQL file and push it as a new migration. Never delete migration files that have been applied to production.
