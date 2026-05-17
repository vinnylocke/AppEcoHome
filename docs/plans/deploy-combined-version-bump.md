# Plan — Combined Major + Minor Version Bump

## Problem

`scripts/deploy.mjs` treats `--bump-major` and `--bump N` as mutually exclusive. When bumping major, minor is hardcoded to 1, ignoring `BUMP_COUNT`. There is no way to deploy at e.g. `07.0003` in a single command.

## Change to `scripts/deploy.mjs`

### 1. One-line fix in `bumpVersion()`

```javascript
// Before — major bump always resets minor to 1
const newMinor = bumpMajor ? 1 : current.minor + BUMP_COUNT;

// After — major bump uses BUMP_COUNT as the starting minor
const newMinor = bumpMajor ? BUMP_COUNT : current.minor + BUMP_COUNT;
```

- `--bump-major` alone → minor = 1 (BUMP_COUNT still defaults to 1, behaviour unchanged)
- `--bump-major --bump 3` → minor = 3
- `--bump 3` alone → minor = current + 3

### 2. Add `npm_config_bump` env-var detection to BUMP_COUNT

npm converts `--bump N` (without `--`) into `npm_config_bump=N`. The positional fallback already catches this case in practice, but adding explicit env-var detection makes it unambiguous:

```javascript
if (process.env.npm_config_bump) {
  const n = parseInt(process.env.npm_config_bump, 10);
  if (!isNaN(n) && n >= 1) return n;
}
```

### 3. Update the usage comment at the top of the file

```
Usage:
  npm run deploy                          → minor +1
  npm run deploy --bump 3                 → minor +3
  npm run deploy --bump-major             → major +1, minor = 1
  npm run deploy --bump-major --bump 3    → major +1, minor = 3
```

## Release notes for this deploy

Two sections:
- "AI Task Optimiser" — already written (the main feature)
- "Under the Hood" — AI usage logging fixed and wired into stats, bug fixes

## No migration needed

No new SQL — all changes are script + frontend only.
