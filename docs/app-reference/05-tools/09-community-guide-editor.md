# Community Guide Editor

> The TipTap-based authoring view for community guides. Title, subtitle, labels, image uploads, full rich-text body, and save/delete flow with optimistic close.

**Trigger:** "Publish" button or `?open=new-guide&tab=community`, or Edit button on a guide you authored.
**Source file:** `src/components/CommunityGuideEditor.tsx`

---

## Quick Summary

A rich-text editor for authoring or editing community guides. Generates a UUID for new guides client-side so image uploads can use it as the storage path immediately. TipTap with StarterKit + Underline + Image + Link + Tables + Placeholder. Images upload to `community-guide-images` bucket. Labels are tag chips. Save writes a single row; delete is gated behind a confirm modal.

---

## Role 1 — Technical Reference

### Component graph

```
CommunityGuideEditor
├── Header (close, title input, save / delete)
├── Subtitle input
├── Labels input (chip + add chip pattern)
├── Toolbar
│   ├── Bold / Italic / Underline
│   ├── H1 / H2 / H3
│   ├── List / Ordered list
│   ├── Quote
│   ├── Table
│   ├── Link
│   └── Image (file picker)
├── TipTap editor (editable)
└── Delete confirm modal
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `guideId` | `string?` | CommunityGuidesTab | If editing existing |
| `initialData` | `CommunityGuide?` | CommunityGuidesTab | Hydrate on edit |
| `onClose` | `() => void` | CommunityGuidesTab | Bail out |
| `onSaved` | `(id) => void` | CommunityGuidesTab | Refresh + jump to reader |

### Local state

| State | Purpose |
|-------|---------|
| `guideId` | Stable id — generated client-side for new guides via `crypto.randomUUID()` so images can use it before save |
| `title`, `subtitle`, `labels` | Header fields |
| `labelInput` | In-flight tag chip |
| `isSaving`, `isDeleting`, `showDeleteConfirm` | Action flags |
| `authorId` | From `auth.getUser` |
| `uploadingImage` | Image upload in flight |

### TipTap extensions

`StarterKit` + `Underline` + `Image` + `Link` + `Placeholder` + `Table` + `TableRow` + `TableHeader` + `TableCell`.

### Image upload flow

1. User picks file from picker.
2. Size check: rejected if > 10 MB.
3. Upload to `community-guide-images/{guideId}/{uuid}.{ext}`.
4. Get public URL.
5. Insert `<img>` node into TipTap at cursor.

### Data flow — write paths

#### Save

```ts
saveGuide({
  id: guideId,
  title, subtitle,
  body: editor.getJSON(),
  labels,
  author_id: authorId,
});
```

Hook does `upsert` on `community_guides` keyed on `id`. On success, `onSaved(id)` fires.

#### Delete

```ts
deleteGuide(guideId);
// → community_guides.delete().eq("id", guideId)
```

Storage cleanup of images is delayed (periodic cleanup job).

### Edge functions invoked

- `summarize-guide` (planned) — generates an AI abstract on first publish.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `cleanup-orphan-guide-images` (planned) | Removes images whose guide row no longer exists |

### Realtime channels

None.

### Tier gating

None — every signed-in user can publish.

### Beta gating

None.

### Permissions

- Editor can only save if `author_id === currentUser`. New guides set `author_id` to current user.

### Error states

| State | Result |
|-------|--------|
| Image too large | Toast |
| Image upload fails | Toast + image not inserted |
| Save fails | Toast; draft retained in-memory |
| Delete fails | Toast; modal stays open |

### Performance

- TipTap editor is heavy on first load — uses lazy import.
- Body persisted as JSON (TipTap's native format) — not HTML.

### Linked storage buckets

- `community-guide-images` — public read; auth write per RLS.

---

## Role 2 — Expert Gardener's Guide

### Why use the editor

Sharing what works. Anyone can publish — your hardiness zone tips, your aphid trick, your container watering routine. Other Rhozly users can star and comment.

### Every flow in the editor

#### 1. Title + subtitle

- Title is required. Subtitle is optional but recommended (shows on the list card).

#### 2. Labels

- Tag chips. Type → Enter to add. Examples: "Beginner", "Roses", "Compost". Used by readers for filtering.

#### 3. Body

- TipTap rich-text. Toolbar covers headings, lists, quotes, tables, links, images.
- Drop or paste images directly (planned) — currently file-picker only.

#### 4. Save

- Top-right Save. Closes editor + jumps you to the reader.

#### 5. Delete (when editing existing)

- Trash icon → confirm modal → deletes the row.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Title | Headline |
| Subtitle | Tagline shown on list cards |
| Labels | Tags for filtering |
| Body | Rich-text content |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Uploading huge images.** 10 MB limit. Resize before upload.
- **Forgetting labels.** Labels are how readers find your guide. Without them, it gets buried.
- **Tables on mobile.** TipTap tables can be fiddly on phones — author on desktop where possible.

### Recommended workflows

- **First guide:** start short. Title + subtitle + 3 paragraphs + 1 image. Iterate.
- **Series:** if you've got more to say, publish multiple guides linked by labels.

### What to do if something looks wrong

- **Editor blank on first load:** TipTap initialisation race. Refresh.
- **Image not inserting:** upload may have failed silently. Check Network tab.
- **Save button greyed out:** title is empty.

---

## Related reference files

- [Guides List](./07-guides-list.md)
- [Community Guide Reader](./08-community-guide-reader.md)
- [Admin Guide Generator](../07-management/09-admin-guide-generator.md)
- [Guides Data Model (cross-cutting)](../99-cross-cutting/08-data-model-guides.md)

## Code references for ongoing maintenance

- `src/components/CommunityGuideEditor.tsx`
- `src/hooks/useCommunityGuides.ts` — `saveGuide`, `deleteGuide`
- TipTap docs
- `community-guide-images` bucket policies
