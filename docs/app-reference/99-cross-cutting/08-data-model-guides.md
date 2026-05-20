# Data Model — Guides, Bookmarks, Drafts

> Two parallel guide systems: `guides` (admin-curated Rhozly content, generated via the Admin Guide Generator) and `community_guides` (user-authored articles with stars + comments). Plus a bookmarks-like pattern via stars.

---

## Quick Summary

```
guides (curated)
├── data: jsonb { title, sections, level, read_time, ... }
├── labels: text[]
└── created_at

community_guides
├── author_id, title, subtitle
├── body: jsonb (TipTap)
├── labels: text[]
├── cover_image_url
├── star_count (denorm)
└── ──► community_guide_stars (user_id, guide_id)
└── ──► community_guide_comments
        ├── parent_comment_id? (1-level threading)
        ├── user_id, body
        └── created_at
```

---

## Role 1 — Technical Reference

### `guides` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `data` | jsonb | All content + metadata |
| `labels` | text[] | Filter tags |
| `created_at` | timestamptz | |

### `guides.data` shape

```ts
{
  title, subtitle,
  level: "Beginner" | "Intermediate" | "Advanced",
  read_time: number,
  sections: [{ heading, body, image_url? }],
  ...
}
```

### `community_guides` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `author_id` | uuid | FK to user |
| `title`, `subtitle` | text | |
| `body` | jsonb | TipTap document |
| `labels` | text[] | |
| `cover_image_url` | text? | |
| `star_count` | int | Denormalised |
| `created_at`, `updated_at` | timestamptz | |

### `community_guide_stars`

```ts
{ id, guide_id, user_id, created_at }
```

Unique constraint on `(guide_id, user_id)`.

### `community_guide_comments`

```ts
{
  id, guide_id, user_id,
  parent_comment_id?,    // 1-level threading
  body,
  created_at,
}
```

### `useCommunityGuides` hook

Exposes:
- `useCommunityGuides({ sort, labelFilter, search })` — list
- `useCommunityGuide(id)` — single with comments + isStarred
- `starGuide`, `unstarGuide`, `postComment`, `deleteComment`, `saveGuide`, `deleteGuide`

### Admin-only authorship

`guides` table is admin-only insert; `community_guides` is per-user.

### Star count denormalisation

A trigger on `community_guide_stars` maintains `community_guides.star_count` for the list sort.

---

## Role 2 — Expert Gardener's Guide

### Why two systems

Different audiences:
- `guides` is editorially-curated. Quality controlled.
- `community_guides` is user-generated. Variable quality, varied perspectives.

Both surface in `/guides` under different tabs.

### Bookmarks via stars

Rhozly doesn't have a formal "bookmark" — starring serves that purpose. Star → use Starred sort on the Community tab.

---

## Related reference files

- [Guides List](../05-tools/07-guides-list.md)
- [Community Guide Reader](../05-tools/08-community-guide-reader.md)
- [Community Guide Editor](../05-tools/09-community-guide-editor.md)
- [Admin Guide Generator](../07-management/09-admin-guide-generator.md)

## Code references for ongoing maintenance

- `src/hooks/useCommunityGuides.ts`
- `supabase/migrations/*_guides.sql`, `*_community_guides.sql`, `*_community_guide_stars.sql`, `*_community_guide_comments.sql`
- `supabase/functions/generate-guide/index.ts`
