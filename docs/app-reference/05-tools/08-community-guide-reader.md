# Community Guide Reader

> The single-guide view for community guides. TipTap-rendered body, star button with optimistic state, comments + threaded replies, edit link if you authored it.

**Trigger:** Tap a guide in the Community Guides tab.
**Source file:** `src/components/CommunityGuideReader.tsx`

---

## Quick Summary

Reads a `community_guides` row by id via `useCommunityGuide` hook. Renders the rich-text body via TipTap (read-only mode). Star toggle posts to `community_guide_stars` with optimistic UI. Comments + 1-level threaded replies via `community_guide_comments`. Author can hit "Edit" to open the editor.

---

## Role 1 — Technical Reference

### Component graph

```
CommunityGuideReader
├── Header
│   ├── Back button
│   ├── Title
│   ├── Edit (if author)
│   └── Star button (count + filled state)
├── Author + date row
├── Cover image
├── TipTap body (read-only)
│   ├── StarterKit
│   ├── Underline, Link, Image, Table, TableRow, TableHeader, TableCell
├── Comments section
│   ├── Add comment composer
│   ├── Comment list
│   │   └── Comment row
│   │       ├── Body, author, time
│   │       ├── Reply button
│   │       └── Delete (if author)
│   └── Reply composer (when replyingTo is set)
└── Loading / error states
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `guideId` | `string` | parent tab | Which guide |
| `currentUserId` | `string \| null` | parent tab | For permission checks |
| `onBack` | `() => void` | parent tab | Back to list |
| `onEdit` | `() => void?` | parent tab | Open editor (only set when current user is author) |

### Local state

| State | Purpose |
|-------|---------|
| `starred`, `starCount` | Optimistic toggles before hook refetches |
| `commentBody`, `submittingComment` | Top-level comment composer |
| `replyingTo`, `replyBody`, `submittingReply` | Per-comment reply |

### Hook data: `useCommunityGuide(guideId)`

Returns `{ guide, isLoading, isStarred, comments, refetch }`. Internally:

- `community_guides` select with author join
- `community_guide_stars` filter for current user
- `community_guide_comments` (with parent_comment_id for threading)

### TipTap extensions used

`StarterKit + Underline + Image + Link + Table + TableRow + TableHeader + TableCell`. Editor is `editable: false`.

### Data flow — write paths

| Operation | Hook fn | DB |
|-----------|---------|----|
| Star | `starGuide(guideId)` | `community_guide_stars.insert` |
| Unstar | `unstarGuide(guideId)` | `community_guide_stars.delete` |
| Post comment | `postComment(guideId, body, parent_id?)` | `community_guide_comments.insert` |
| Delete own comment | `deleteComment(commentId)` | `community_guide_comments.delete` |

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None directly — refetch happens on each star/comment action.

### Tier gating

None — every signed-in user can read, star, and comment.

### Beta gating

None.

### Permissions

- Delete a comment only if `comment.user_id === currentUserId` (or admin).
- Edit the guide only if `guide.author_id === currentUserId`.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Inline error + retry |
| Star fails | Reverts optimistic state |
| Comment fails | Inline error in composer |
| Reply fails | Inline error in reply composer |

### Performance

- Single-guide fetch (small payload).
- Optimistic star toggle = instant UI.
- Comments fetched alongside guide; no separate roundtrip.

### Linked storage buckets

- `community-guide-images` — body images (uploaded via editor).

---

## Role 2 — Expert Gardener's Guide

### Why open this view

Community guides are a window into how other Rhozly users garden. Star the ones you find useful (you can come back to them via the Starred filter on the list). Comment on the ones where you have something to add or a question.

### Every flow on this view

#### 1. Star a guide

- Star icon → flips state + bumps count.
- Helps surface popular guides in the list's "Starred" sort.

#### 2. Comment

- Composer at the bottom of the page.
- Send → comment appears at the top of the list.

#### 3. Reply to a comment

- "Reply" on any comment → composer shifts to reply mode.
- Reply nests one level.

#### 4. Delete your own

- Trash icon on comments you authored.

#### 5. Edit (author only)

- "Edit" button in header → opens editor with current state.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Star count | Number of users who starred this |
| Author + date | Who wrote it, when |
| Comment count | Total comments + replies |
| Body | Rich-text article — supports headings, lists, images, tables |
| Reply chevron | Threaded reply |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Treating community guides as authoritative.** They're user-written. Cross-check critical advice.
- **Replying to your own comment by mistake.** Use Edit (if available) — replies don't merge with the parent.
- **Hitting send on a half-written comment.** No edit yet — you'd have to delete + repost.

### Recommended workflows

- **Use stars as bookmarks.** Star anything you might re-read.
- **Engage with the author.** Comments are public; healthy back-and-forth makes the guide more valuable for everyone.

### What to do if something looks wrong

- **Guide not loading:** check connectivity. The reader fetches a single row.
- **Star didn't persist:** check toast — RLS denial means you're not signed in.

---

## Related reference files

- [Guides List](./07-guides-list.md)
- [Community Guide Editor](./09-community-guide-editor.md)
- [Guides Data Model (cross-cutting)](../99-cross-cutting/08-data-model-guides.md)

## Code references for ongoing maintenance

- `src/components/CommunityGuideReader.tsx`
- `src/hooks/useCommunityGuides.ts` — fetch + star/comment helpers
- TipTap docs for body rendering
- `supabase/migrations/*_community_guide_stars.sql`
- `supabase/migrations/*_community_guide_comments.sql`
