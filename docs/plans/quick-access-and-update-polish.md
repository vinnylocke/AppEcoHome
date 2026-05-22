# Plan — Quick Access compaction + update-flow timing

Four interlinked issues. Issues 1-3 are layout polish on `/quick`; issue 4 is the deploy/update-flow timing bug.

## 1. Hero card "small and squished"

After the SeasonalPicksCard mount in the last wave the hero feels cramped. Likely cause: the hero is now competing with one more vertical block. The hero card itself isn't `shrink-0` — under flex column with growing children, the browser is happy to size it down on shorter phones.

**Fix**: tighten the hero — smaller padding, drop the decorative sprout on the smaller variant, drop the eyebrow pill (already used elsewhere on the page) so the greeting reads as the headline. Add `shrink-0` to lock its height.

**Files**: `src/components/QuickAccessHome.tsx`.

## 2. 4 tiles on one line instead of 2×2

Current grid is `grid-cols-2 gap-3`. Switching to `grid-cols-4 gap-2` puts them on one row. Each tile already supports a `compact` layout — we just need to make sure the icon + title + description still read at the narrower width. May need to drop descriptions on very narrow viewports.

**Files**: `src/components/QuickAccessHome.tsx`, `src/components/quick/QuickTile.tsx` (review width handling, no schema change).

## 3. Seasonal picks — one-at-a-time with arrows + swipe

Current card uses `overflow-x-auto snap-x snap-mandatory` with a 260px-wide tile — multiple tiles visible at once. User wants ONE visible at a time with explicit nav.

**Fix**: add a new "carousel" mode to `SeasonalPicksCard` (or a new `variant="carousel"`). Behaviour:
- One tile per "page" — width 100% of the card.
- Prev / Next chevron buttons in the header (the existing refresh button stays).
- A dot indicator showing position (e.g. ● ○ ○ ○).
- Swipe still works via the existing snap-x behaviour — we just remove the multi-tile width so each snap-target is full-width.

Mount the carousel variant on QuickAccessHome (since it's the most constrained surface). Keep `today` and `dashboard` variants as they are.

**Files**: `src/components/seasonal/SeasonalPicksCard.tsx`, `src/components/QuickAccessHome.tsx` (consume the new variant).

## 4. Deploy/update timing: release notes show before the update

### Root cause

The deploy script bumps `app_config.app_version` in the DB **before** the new bundle finishes deploying to Vercel (current order is steps 2.5 → 3 → 4 in `scripts/deploy.mjs`). Existing users on the old bundle then:

1. Open the app during maintenance → blocked (good)
2. After maintenance off, the old cached bundle reads the new DB version
3. `useAppVersion` effect compares against `localStorage.rhozly_last_seen_version` → mismatch → shows release notes on the OLD bundle
4. `sessionStorage.rhozly_just_saw_release_notes` flag is set
5. SW later notices the new bundle waiting → `onNeedRefresh` fires → **suppressed** because the flag is set
6. The UpdateBanner never shows; the user keeps running the old bundle until they happen to reload manually

### Two-part fix

**Part A — reorder the deploy script** so the DB bump + release_notes insert run **after** Vercel deploys:

```
1. Maintenance ON
2. DB push (migrations)
3. Deploy edge functions
4. Deploy to Vercel        ← new bundle is now live
5. Bump DB version + insert release_notes     ← was at step 2.5
6. Maintenance OFF
```

This ensures:
- New bundle is deployable before any user is told "v X.Y" exists.
- Users returning after maintenance with an old cached bundle don't immediately read a "new" DB version — the new version isn't there yet when their old bundle's `useAppVersion` fires.
- A few seconds later step 5 lands. By then the SW has typically already detected the new bundle waiting; user gets the UpdateBanner first, reloads, runs new bundle, sees release notes correctly.

**Part B — bundle version awareness** to fully eliminate the race. Write the new version to `public/build-version.json` BEFORE the Vercel build, so the deployed bundle "knows" its own version. Compare `bundleVersion` (from `/build-version.json`) against `dbVersion` (from `app_config`):

- `bundleVersion === dbVersion` → release notes can fire if not yet seen.
- `bundleVersion < dbVersion` → DB is ahead of bundle → user is on stale code → fire the **UpdateBanner** instead of release notes.

This means even if part A's ordering breaks, the bundle defends itself.

**Files**:
- `scripts/deploy.mjs` — reorder steps + write `public/build-version.json` with the new version before Vercel deploy.
- `public/.gitignore` (or repo `.gitignore`) — `build-version.json` is build output, doesn't belong in git.
- `src/hooks/useAppVersion.ts` — return `{ bundleVersion, dbVersion }` (or two separate hooks).
- `src/App.tsx` — release-notes effect now keys off `bundleVersion`; if `bundleVersion < dbVersion` dispatch the `pwa-update-available` event so UpdateBanner shows.

## Sequencing

1. Issue 1 — hero card compaction (cheap).
2. Issue 2 — 4 tiles in one row (cheap).
3. Issue 3 — picks carousel (new variant on `SeasonalPicksCard`, mount on `QuickAccessHome`).
4. Issue 4A — reorder `scripts/deploy.mjs`.
5. Issue 4B — `public/build-version.json` + `useAppVersion` split + App.tsx gating.
6. Typecheck + tests + deploy.

The deploy itself proves issue 4 since the next deployment exercises the new flow.

## App-reference touches

- [docs/app-reference/02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — note the new 4-on-a-line layout + carousel mount.
- [docs/app-reference/99-cross-cutting/31-deployment.md](../app-reference/99-cross-cutting/31-deployment.md) — capture the new deploy step order.
- [docs/app-reference/99-cross-cutting/32-release-notes.md](../app-reference/99-cross-cutting/32-release-notes.md) — document the bundle-version gate.
