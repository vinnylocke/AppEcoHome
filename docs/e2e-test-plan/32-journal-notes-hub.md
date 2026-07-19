# 32. Journal / Notes Hub

**Spec files:** `tests/e2e/specs/journal-notes-hub.spec.ts`
**Page Objects:** none (testid-based, self-contained)
**Seeds:** none required — the hub, switch, and empty Notes surface render without seeded rows

> Created 2026-07-19 (Phase 5 IA merge). `/journal` is now a tabbed hub
> (`JournalNotesHub`, `src/components/JournalNotesHub.tsx`) with a segmented
> switch (`journal-notes-switch`) toggling the existing **Journal**
> (`GlobalJournal` → `plant_journals`) and **Notes** (`NotesPage` → `notes`)
> surfaces. It is a UI-only merge — no data migration; each tab keeps its own
> table and testids. The standalone `/notes` route now redirects to
> `/journal?tab=notes`, and the standalone "Notes" primary-nav item was removed
> (the "Journal" item covers both). Unit coverage of the tab logic lives in
> `tests/unit/components/JournalNotesHub.test.ts`.

## Hub — tab switching & redirect (2026-07-19)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| JNH-001 | ✅ | `/journal` shows the `journal-notes-switch` and defaults to the Journal tab (`aria-selected`), Notes surface not mounted | — | ✅ Passing |
| JNH-002 | ✅ | Tapping the **Notes** tab swaps in `notes-page` and updates the URL to `/journal?tab=notes` | — | ✅ Passing |
| JNH-003 | ✅ | Legacy `/notes` redirects into the hub's Notes tab (`/journal?tab=notes`, `notes-page` visible) | — | ✅ Passing |

## Related

- App reference: [Global Journal](../app-reference/03-garden-hub/11-global-journal.md), [Notes](../app-reference/03-garden-hub/14-notes.md)
- Routing: [21-routing.md](../app-reference/99-cross-cutting/21-routing.md)
