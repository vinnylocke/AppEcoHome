# Release Notes Modal

> A versioned changelog modal that opens from the User Profile Dropdown footer or the "What's New" pulse dot. Each release card lists New / Improved / Fixed / Deprecated items with optional deep-link buttons.

**Source file:** `src/components/ReleaseNotesModal.tsx`
**Hook:** `src/hooks/useReleaseNotes.ts`

---

## Quick Summary

Fetches `release_notes` rows; each row has `{ version, date, sections: [{ label, items: [{ text, link? }] }] }`. Sections are rendered as labelled groups (New ✨, Improved 📈, Fixed 🔧, Removed 🗑️). Each item supports a navigation deep-link via `useNavigate(link.path)`. Per-note `NoteBoundary` swallows corrupt-row errors so a bad row doesn't crash the whole modal.

---

## Role 1 — Technical Reference

### Component graph

```
ReleaseNotesModal (focus-trapped)
├── Header (close, title)
└── For each release version
    └── NoteBoundary (per-version)
        └── Release card
            ├── Version badge + date
            └── For each section
                ├── Section label + icon
                └── Items (text + optional deep-link button)
```

### Release schema

```ts
ReleaseNote = {
  version: string,
  date: string,
  sections: [
    { label: "New" | "Improved" | "Fixed" | "Removed", items: NormalisedItem[] }
  ]
};

NormalisedItem = { text: string, link: { label, path } | null };
```

The `normaliseItem` helper coerces raw entries — handles legacy rows that may be a primitive string or missing `.text`. Returns `null` for unrecoverable entries (skipped).

### `NoteBoundary`

Tiny per-version error boundary. If a release row crashes mid-render, shows a graceful fallback ("Could not display notes for Rhozly OS X.Y.Z.") instead of crashing the modal.

### Data flow — read paths

```ts
useReleaseNotes() →
  supabase.from("release_notes").select("*").order("version", desc);
```

Or in dev, statically reads `release-notes.json`.

### Data flow — write paths

None — read-only from the user's side.

### Edge functions invoked

None.

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
| Corrupt row | NoteBoundary catches → fallback row |
| Empty | "No release notes yet" |
| Fetch fails | Empty state |

### Performance

- Single fetch; lightweight render.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this modal

To see what's new + what's been fixed since you last looked. Each section is intentionally short — bullet points, not essays. Deep links jump you to the new feature.

### Every flow on this modal

#### 1. Browse

- Latest at the top. Scroll for older.

#### 2. Tap a deep link

- Some items have an action button — tap to navigate to that feature.

### Tier-by-tier experience

Same for every tier — but tier-gated features still paywall when you arrive.

### Common mistakes / pitfalls

- **Treating empty cards as broken.** Some old releases have minimal notes. Not a bug.

### Recommended workflows

- **Each time the pulse dot shows up:** open, skim, dismiss.

### What to do if something looks wrong

- **Error fallback row:** that release has corrupt data — file a bug.
- **No notes at all:** the `release_notes` table or JSON didn't load — check console.

---

## Related reference files

- [User Profile Dropdown](../06-account/09-user-profile-dropdown.md) — entry points
- [Release Notes Pipeline (cross-cutting)](../99-cross-cutting/32-release-notes.md)

## Code references for ongoing maintenance

- `src/components/ReleaseNotesModal.tsx`
- `src/hooks/useReleaseNotes.ts`
- `release-notes.json`
- `scripts/append-release-notes.mjs` (or similar tooling)
