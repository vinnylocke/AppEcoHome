# Notes

> Free-form notebook with rich text (TipTap), image attachments, tables, lists, checkboxes — and many-to-many polymorphic links to plants, areas, locations, plans, ailments, and seed packets. Lives alongside the Journal (event-anchored) and is meant for ideas, observations and reminders.

**Route:** `/notes`
**Source files (entry points):**
- `src/components/notes/NotesPage.tsx`
- `src/components/notes/NoteEditorOverlay.tsx`
- `src/components/notes/NoteTipTapEditor.tsx`
- `src/components/notes/LinkTargetsPanel.tsx`
- `src/components/notes/NoteCard.tsx`
- `src/components/notes/NotesDrawer.tsx` (embeddable section for entity pages)
- `src/hooks/useNotes.ts`
- `src/hooks/useNoteLinks.ts`
- `src/lib/noteHelpers.ts` (pure helpers — `firstImageInDoc`, `docToPlainText`)

---

## Quick Summary

`/notes` shows a responsive grid of note cards — pinned notes first, then by `updated_at`. Tapping a card opens a portal-modal editor. The editor uses TipTap with our toolbar (headings, bold/italic, bullet/ordered/checklist, blockquote, table, image, link, undo/redo). Every note can link to **any number of** plants, areas, locations, plans, ailments, or seed packets via a join table — and the same `NotesDrawer` component renders a per-entity list on any detail surface that mounts it.

---

## Role 1 — Technical Reference

### Component graph

```
NotesPage (/notes)
├── Header — title + search + "+ New note"
├── Empty state OR
├── Pinned grid
│   └── NoteCard × n  (cover image + title + snippet + link chips)
├── All notes grid
│   └── NoteCard × n
└── NoteEditorOverlay (Portal)
    ├── Header (title input + pin toggle + close)
    ├── NoteTipTapEditor
    │   └── Toolbar (sticky) + EditorContent
    ├── LinkTargetsPanel (multi-select picker)
    └── Footer (Delete / Archive / Save)

NotesDrawer (embeddable on entity pages)
├── Header — "Notes (n)" + "+ New note"
├── Linked-note rows  (cover thumb + title + updated_at chevron)
└── NoteEditorOverlay (Portal, prefilled with the current target link)
```

### Data model

| Table | Columns |
|-------|---------|
| `notes` | `id`, `home_id`, `user_id`, `title`, `content jsonb`, `body_text`, `cover_image_url`, `pinned`, `archived_at`, `created_at`, `updated_at` |
| `note_links` | `id`, `note_id`, `target_type`, `target_id text`, `created_at`. Unique on `(note_id, target_type, target_id)`. |

`target_type` is one of: `plant_instance`, `plant`, `location`, `area`, `plan`, `ailment`, `seed_packet`. `target_id` is **text** so it can hold both uuid and the integer `plants.id`. Cast on read where the FK shape matters.

Indexes:
- `notes_home_updated_idx` on `(home_id, updated_at DESC) WHERE archived_at IS NULL` — drives the page load.
- `notes_pinned_idx` partial on pinned rows.
- `note_links_target_idx` on `(target_type, target_id)` — drives the drawer.

Trigger: `notes_touch_updated_at` bumps `updated_at` on every UPDATE.

### Data flow — read paths

```ts
// Main page
supabase
  .from("notes")
  .select("*, note_links(target_type, target_id)")
  .eq("home_id", homeId)
  .is("archived_at", null)
  .order("pinned", { ascending: false })
  .order("updated_at", { ascending: false })
  .limit(200);

// Entity drawer
supabase
  .from("note_links")
  .select("notes(id, title, cover_image_url, updated_at, pinned, archived_at)")
  .eq("target_type", targetType)
  .eq("target_id", String(targetId));
```

### Data flow — write paths

| Action | DB |
|--------|----|
| Create | `notes.insert(...)` → then `note_links.insert([...])` if links |
| Update body / title / pin | `notes.update(...)` |
| Replace links | `note_links.delete(eq note_id)` → reinsert |
| Archive | `notes.update({ archived_at: now })` |
| Delete | `notes.delete()` — cascades through note_links |

`body_text` and `cover_image_url` are projections of `content` (TipTap JSON), computed on the client via `docToPlainText()` and `firstImageInDoc()` in `noteHelpers.ts`.

### Edge functions invoked

None directly. Image uploads use `supabase.storage.from("plant-images").upload(...)` to `notes/{homeId}/{rand}.{ext}` — same bucket as the journal, no new policy work.

### Cron / scheduled jobs

None.

### Realtime channels

None today. Multi-tab edits resolve on next load.

### Tier gating

Free for every tier. Future AI-summary / tag-suggest buttons in the editor will be Sage+ (deferred).

### Beta gating

None.

### Permissions

RLS scopes notes by `home_members` membership — every member of the home reads + writes all notes. `note_links` inherits via the embedded `notes(home_id)` FK chain.

### Error states

| State | Result |
|-------|--------|
| Notes load fails | "Failed to load notes" with a Retry button |
| Image upload fails | Silent toast via Logger; editor stays open |
| Create / update / delete fail | Logger.error + toast; UI optimistically reverts |

### Performance

- One round trip on page load (200 newest notes with their links embedded).
- TipTap lazy-loaded with the `/notes` route — non-notes pages don't ship the editor bundle.
- Drawer query is index-served (`note_links_target_idx`).

### Linked storage buckets

`plant-images` — reused under `notes/{homeId}/` prefix. No bucket migration needed.

---

## Role 2 — Expert Gardener's Guide

### Why open this surface

Some thoughts don't belong on a single plant. Maybe you've been thinking about a layout change next year, or want to remember why you chose a particular tomato variety, or have a rolling shopping idea. Notes is for those — looser than the Journal (which is event-anchored: "watered today", "harvested 200g"), with rich formatting and tags that link to multiple parts of your garden.

### Every flow on this surface

- **New note** — top-right button. Opens an empty editor; type a title (optional), write the body, link to anything, save.
- **Search** — type in the header bar; filters by title and body text.
- **Pin** — pin icon in the editor header. Pinned notes float to the top of the page.
- **Archive** — hides from the main page but keeps the data (handy for old project notes you don't want to delete).
- **Delete** — destructive, confirmed by the OS dialog. Removes the note and its links.
- **Link to…** — multi-select dropdown inside the editor. Search for any plant, area, location, plan, ailment, or seed packet and chip it on. Find the note later from that entity's Notes section.

### Information on display — what every field means

- **Cover image** — auto-pulled from the first image in your note body. No need to pick one.
- **Title** — optional. If blank, the card shows "Untitled note".
- **Snippet** — first ~140 chars of plain-text body. Helps you find the note from the list at a glance.
- **Link chips** — coloured chips showing which targets the note is linked to. Max 3 shown + a "+N" badge.
- **Updated** — relative date ("Today", "Yesterday", "5 days ago", or `15 Sep`).

### Tier-by-tier experience

No differences today. Future AI tooling (summarise / suggest tags) will be Sage+.

### Common mistakes / pitfalls

- **"My image disappeared after I deleted my note"** — images are stored in the `plant-images` bucket. Deleting the note doesn't delete the image (that'd be expensive to GC). They'll be cleaned up by a future storage sweep cron.
- **Linking is many-to-many** — one note can link to many things. The same note may appear in multiple entity drawers.

### Recommended workflows

- Use a Note for any thought that doesn't fit a single plant — projects, layout ideas, lessons learned, what to try next year.
- Pin the 1-2 notes you check often (e.g. "Greenhouse winter checklist").
- Link liberally — a note about "powdery mildew prevention" can link to every cucurbit + the relevant ailment + the spray you bought.

### What to do if something looks wrong

- **No notes showing** — your home must have at least one member (you). Refresh; if blank with no error, the table may just be empty.
- **Linked note doesn't appear on an entity** — check the note's "Links" panel; the entity may have been renamed but the link survives by ID.

---

## Related reference files

- [Global Journal](./11-global-journal.md) — sibling surface, event-anchored, single-target
- [Quick Access Home](../02-dashboard/09-quick-access-home.md) — `notes` is in the Quick Launcher catalogue
- [Routing](../99-cross-cutting/21-routing.md) — `/notes`
- [Image Sources](../99-cross-cutting/24-image-sources.md) — `plant-images` bucket conventions

## Code references for ongoing maintenance

- `src/components/notes/*` — UI
- `src/hooks/useNotes.ts`, `src/hooks/useNoteLinks.ts`
- `src/lib/noteHelpers.ts`
- `supabase/migrations/20260708000002_notes.sql`
