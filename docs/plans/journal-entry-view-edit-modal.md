# #9 — Journal entries clickable (View / Edit modal) + condensed list + Notes parity

## Problem / goal
Journal entries on `/journal` aren't openable — `JournalEntryCard` shows a 3-line description clamp + a delete button, with no way to see the full entry or edit it. `useGlobalJournal.update()` is fully implemented but called from nowhere. Notes, by contrast, open **straight into the edit overlay** (no read-only view). Goal: tap a journal entry → a clean **read-only View modal** with an **Edit** button inside; condense the list rows; and give Notes the same tap-to-View treatment.

## App-reference consulted
- `docs/app-reference/03-garden-hub/11-global-journal.md`
- `docs/app-reference/03-garden-hub/14-notes.md`
- `docs/app-reference/99-cross-cutting/07-data-model-media.md`

## Approach

### Journal (core)
1. **JournalComposer** — add an optional `entry?: JournalEntry` prop. When present: prefill subject / description / image / target, heading "Edit journal entry", CTA "Save changes", and save calls `update(entry.id, patch)` instead of `create`.
2. **JournalEntryModal** (NEW, `src/components/journal/JournalEntryModal.tsx`) — portal modal with two modes:
   - **View** (default): image + subject + full description + target chip + Auto badge + timestamp, read-only; **Edit** + **Close** (+ Delete).
   - **Edit**: renders `<JournalComposer entry=… onSaved onClose>`; on save → back to View (or close) + refresh.
3. **JournalEntryCard** — make the card body tappable (`onOpen(entry)`); condense to subject + chip + time + thumbnail + a **2-line** description clamp; keep the delete button + target-chip `Link` as `stopPropagation` controls so they don't trigger View.
4. **GlobalJournal** — hold the open entry in state, render `JournalEntryModal`, wire card `onOpen`; refresh on update, drop on delete.

### Notes parity
5. **NoteTipTapEditor** — add an `editable?: boolean` prop → `useEditor({ editable })` (default true).
6. **NoteEditorOverlay** — add a `startInView` prop → open read-only (editable=false; backdrop-click just **closes**, never saves), header shows an **Edit** button flipping to edit mode.
7. **NotesPage** — open tapped notes with `startInView` (View first); "New note" stays edit.

## Files changed
- `src/components/journal/JournalComposer.tsx` (edit mode)
- `src/components/journal/JournalEntryModal.tsx` (NEW)
- `src/components/journal/JournalEntryCard.tsx` (tap + condense)
- `src/components/GlobalJournal.tsx` (wire modal)
- `src/components/notes/NoteTipTapEditor.tsx` (`editable` prop)
- `src/components/notes/NoteEditorOverlay.tsx` (`startInView` view mode)
- `src/components/notes/NotesPage.tsx` (open in View)

## Tests
- Vitest: `JournalComposer` edit mode — prefill + `update` called (not `create`).
- Playwright rows: journal card tap → modal; Edit → save; note tap → View → Edit.

## Docs to update
- `11-global-journal.md`, `14-notes.md`; e2e-test-plan journal + notes rows.

## Risks
- **NoteEditorOverlay auto-saves on backdrop-click** (`onClick` → `handleSave`). In View mode it must **close, not save** — gate the backdrop + close handlers by mode. This is the main correctness watch-point.
- Card tap vs. inner controls (delete, target `Link`) — `stopPropagation` on both.
