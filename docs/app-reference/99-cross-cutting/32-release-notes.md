# Release Notes Pipeline

> Release notes live in `release-notes.json` at the repo root and are kept up-to-date as work is done. On deploy, the version is bumped and the notes are surfaced via the ReleaseNotesModal.

---

## Quick Summary

```
release-notes.json (committed)
└── [{ version, date, sections: [{ label, items: [{ text, link? }] }] }, ...]
        │
        └── consumed by:
            ├── ReleaseNotesModal (in-app)
            ├── User Profile Dropdown footer (version label)
            └── What's New pulse dot
```

Continuously maintained — every PR adds to the in-progress version's items. On deploy, version is bumped and "What's New" pulse fires for ~7 days.

---

## Role 1 — Technical Reference

### `release-notes.json` shape

```ts
[
  {
    version: "1.34.0",
    date: "2026-05-20",
    sections: [
      {
        label: "New",
        items: [
          { text: "Plant Visualiser sprite wizard" },
          { text: "Optimise AI suggestions", link: { label: "Open", path: "/schedule?tab=optimise" } },
        ],
      },
      {
        label: "Improved",
        items: [...],
      },
      {
        label: "Fixed",
        items: [...],
      },
    ],
  },
  // older versions ...
]
```

### Section labels (canonical)

- `New` (✨)
- `Improved` (📈)
- `Fixed` (🔧)
- `Removed` (🗑️)

### Bumping versions

`scripts/append-release-notes.mjs` (or similar) supports:
- `--bump N` — incremental (e.g. 1.34.0 → 1.34.N)
- `--bump-major` — major release

Major bumps reset minor/patch.

### Item shape

```ts
{ text: string, link?: { label, path } }
```

`text` is required. `link.path` is a relative app route; opening dismisses the modal and navigates.

### Format guard

`ReleaseNotesModal` uses `normaliseItem(item)` to coerce legacy shapes (bare strings, partial objects) into the canonical shape. Per-version `NoteBoundary` catches corrupt rows so one bad release doesn't crash the modal.

### "What's New" detection

`UserProfileDropdown` tracks:
- `localStorage.rhozly_last_seen_version`
- `localStorage.rhozly_version_first_seen_at`

Pulse dot appears if first-seen-at is within 7 days. Dismisses on tapping What's New or footer version label.

### Bundle-version filter (what the modal actually shows)

`useReleaseNotes()` returns the full DB list (all versions ever deployed). `App.tsx` filters that list down to **versions ≤ the currently-running bundle key** before passing it to `ReleaseNotesModal`. This matters because the deploy pipeline writes the new `release_notes` row *before* the user's bundle has finished rolling out — without the filter, a stale-bundle user would see bullets describing code they don't have yet.

The filter:
- Compares against `useAppVersion().bundleVersionKey` (the version inside `/build-version.json`, NOT the DB latest).
- Falls back to the unfiltered list if the bundle key is unreadable (defensive — preferable to an empty modal).
- Applies to both `mode="latest"` (header reads "What's new in Rhozly OS {bundle}") and `mode="history"` (the all-versions list is capped at the bundle the user is running).

After an update reload, `bundleVersionKey` flips to the new value and the next-version notes become available.

### Cron / scheduled jobs

None — release notes are static + bundled with the build.

### Continuous maintenance rule

(From repo memory): "Maintain release-notes.json continuously as work is done; review, confirm bump count, deploy when ready."

---

## Role 2 — Expert Gardener's Guide

### Why this matters

Users see what's changed when they tap the "What's New" pulse dot. Good release notes drive feature adoption + reduce support tickets.

### Format conventions

- Lead with the user-visible change ("Add ailment photos" vs "PR #2017").
- One bullet per change.
- Use `Improved` for tweaks, `New` for greenfield, `Fixed` for bug fixes.

---

## Related reference files

- [Release Notes Modal](../08-modals-and-overlays/19-release-notes.md)
- [User Profile Dropdown](../06-account/09-user-profile-dropdown.md) — pulse + footer
- [Deployment Pipeline](./31-deployment.md)

## Code references for ongoing maintenance

- `release-notes.json` (repo root)
- `scripts/append-release-notes.mjs`
- `src/components/ReleaseNotesModal.tsx`
- `src/hooks/useReleaseNotes.ts`
