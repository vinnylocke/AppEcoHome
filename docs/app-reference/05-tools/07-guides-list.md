# Guides List

> The Guides tab — three sub-tabs:
> 1. **Rhozly Guides** — curated/admin-authored articles
> 2. **Community Guides** — user-authored articles with stars + comments
> 3. **App Help** — searchable help for using Rhozly itself

**Route:** `/guides` (default tab = `rhozly`)
**Source files:**
- `src/components/GuideList.tsx` — sub-tab router + Rhozly tab
- `src/components/CommunityGuidesTab.tsx` — Community tab
- `src/components/AppHelpSearch.tsx` — App Help tab
- `src/components/CommunityGuideReader.tsx` — single-guide view
- `src/components/CommunityGuideEditor.tsx` — authoring

---

## Quick Summary

A three-tab guide center. Rhozly tab pulls from `guides` table, supports label filtering, search, an in-place reader with scroll progress, and a "first visit" banner ("New to gardening apps? Start here →"). Community tab uses `useCommunityGuides` hook, supports sort by latest / starred, label filter, and stars / comments. App Help is a static-content search over docs that ship with the app — also reachable via the top-level `/help` route (Sprint 2, 2026-06-15) which redirects to `?tab=help`.

**Saved-only filter (Sprint 2, 2026-06-15):** when the user has at least one bookmarked Rhozly guide, a "Show saved only" chip appears above the guide grid. Toggling it filters to bookmarks; bookmarks are persisted in the existing `guide_bookmarks` table.

**Content Feedback control:** the Rhozly guide reading view renders the reusable `<ContentFeedback>` 👍/👎 control ("Was this guide helpful?") at the foot of the article — surface `rhozly-guide`, target = guide id + title. It writes to the `content_feedback` table (distinct from the AI `ai_feedback` learning signal); a 👎 reveals an optional "tell us what's wrong / inaccurate" box. The App Help tab (`AppHelpSearch`) carries its own control on each answer — see [Help Center / App Help](../08-modals-and-overlays/24-help-center.md).

---

## Role 1 — Technical Reference

### Component graph

```
GuideList
├── Sub-tab bar (Rhozly / Community / App Help)
├── First-visit banner ("Start here →")
├── Rhozly tab
│   ├── Search box
│   ├── Label dropdown (Beginner / Intermediate / Advanced / Topic tags)
│   ├── Guide list
│   └── Reading view (active guide)
│       ├── Title / time / level
│       ├── Body (markdown)
│       └── Scroll progress bar
├── Community tab → CommunityGuidesTab
└── App Help tab → AppHelpSearch
```

### URL state

- `?tab=` — sub-tab id
- `?q=` — search query (Rhozly tab)
- `?open=new-guide` (with `?tab=community`) — opens the Community editor in "new" mode

### Local state (key items)

| State | Purpose |
|-------|---------|
| `activeTab` | "rhozly" / "community" / "help" |
| `guides`, `isLoading`, `fetchError` | Rhozly guides fetch |
| `searchQuery`, `selectedLabel` | Filters |
| `isDropdownOpen`, `labelSearchQuery`, `focusedOptionIndex` | Dropdown a11y |
| `activeGuide`, `readingVisible`, `readingLoading` | Reader |
| `readProgress` | Scroll progress 0-100 |
| `showGuideBanner` (LS-backed) | First-visit hint |

### Data flow — read paths

#### Rhozly tab
```ts
supabase.from("guides").select("*").order("created_at", { ascending: false });
```

#### Community tab (via `useCommunityGuides`)
```ts
supabase.from("community_guides").select("*, ...").order(...);
```

#### App Help
Static search over bundled JSON of help articles.

### Data flow — write paths

#### Community star (in reader)
```ts
supabase.from("community_guide_stars").insert({ guide_id, user_id });
// or .delete() if already starred
```

#### Community comment (in reader)
```ts
supabase.from("community_guide_comments").insert({ guide_id, user_id, body });
```

#### Community publish/edit (via Editor)
- See [09-community-guide-editor.md](./09-community-guide-editor.md)

### Edge functions invoked

- `summarize-guide` (planned, on community publish) — AI-generated abstract.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `refresh-guide-search-index` (planned) | Rebuilds search index |

### Realtime channels

- Community tab can subscribe to `community_guides` for new-publish updates (implementation may vary).

### Tier gating

| Feature | Tier |
|---------|------|
| Read Rhozly guides | Every tier |
| Read Community guides | Every tier |
| Publish Community guide | Every tier (signed-in user) |
| AI-suggested guide based on conditions | Sage / Evergreen (planned) |

### Beta gating

None.

### Permissions

- Authoring is per-user; editing is restricted to original author (or admin).

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Inline error with retry |
| No guides match filter | Empty state |
| Community publish fails | Toast + draft preserved |

### Performance

- Guide list lightweight (just metadata).
- Reading view lazy-loads body markdown if separate.
- Scroll progress wired to nearest scrollable ancestor for accuracy.

### Linked storage buckets

- `community-guide-images` — cover images for community guides.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Guides are how Rhozly teaches. Three different lenses:

- **Rhozly Guides** — the curated baseline. "How to start a vegetable garden", "When to prune apple trees", "Companion planting basics". Author by Rhozly staff/admin.
- **Community Guides** — user-written. More personal, more varied. "My south-facing balcony in zone 9a", "How I beat aphids without sprays".
- **App Help** — how to *use Rhozly itself*. "Where do I add a new plant?" "How do I export my data?"

### Every flow on this screen

#### 1. Browse Rhozly guides

- Tab bar → Rhozly.
- Search by keyword; filter by label (Beginner / Intermediate / Advanced / Topic).
- Tap a guide → in-place reader with scroll progress.

#### 2. Read a guide

- Title / read time / level chips.
- Body renders as markdown.
- Scroll progress bar at the top shows how far through you are.

#### 3. Community

- Sort by Latest or Starred.
- Open a guide → reader with stars + comments.
- "Publish" → opens editor (`?open=new-guide`).

#### 4. App Help

- Search-as-you-type over bundled help articles.
- Tap a result → inline answer.
- Each answer (and every Rhozly guide you read) ends with a small 👍/👎 — tap 👎 to add a one-line note about what was wrong or inaccurate. It's the quickest way to tell us a guide is misleading.

#### 5. First-visit banner

- "New to gardening apps? Start here →" — pinned banner on first visit.
- Tap → opens the pinned "Getting Started with Rhozly" guide.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Level chip | Beginner / Intermediate / Advanced |
| Read time | Estimated minutes |
| Label chip | Topic tag |
| Star count | Community stars |
| Comment count | Community comments |
| Scroll progress | 0–100% through the article |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Confusing Rhozly guides with Community guides.** Curated vs user-authored — quality varies.
- **Searching App Help when you want a guide.** App Help answers "how to use Rhozly"; Guides answer "how to garden".
- **Banner dismissed by accident.** It only shows once. Subsequent visits, you'll need to find the pinned "Getting Started" guide manually.

### Recommended workflows

- **New user:** open Guides → read Getting Started → bookmark "Beginner" filter.
- **Topic-driven research:** Rhozly guides → filter by topic (Companion Planting / Pruning / etc).
- **Real-world tactics:** Community guides → sort by Starred for crowd favourites.

### What to do if something looks wrong

- **No guides showing:** filter may be too aggressive — reset to "All".
- **Reader stuck loading:** the markdown body fetch may have failed. Tap back, re-open.
- **App Help empty:** the bundled JSON may have failed to load. Reload.

---

## Related reference files

- [Community Guide Reader](./08-community-guide-reader.md)
- [Community Guide Editor](./09-community-guide-editor.md)
- [Admin Guide Generator](../07-management/09-admin-guide-generator.md)
- [Guides Data Model (cross-cutting)](../99-cross-cutting/08-data-model-guides.md)

## Code references for ongoing maintenance

- `src/components/GuideList.tsx` — entry
- `src/components/CommunityGuidesTab.tsx` — community list
- `src/components/AppHelpSearch.tsx` — help search
- `src/components/CommunityGuideReader.tsx` — single guide
- `src/components/CommunityGuideEditor.tsx` — authoring
- `src/components/feedback/ContentFeedback.tsx` — reusable 👍/👎 + comment control (writes `content_feedback`, surface `rhozly-guide` here)
- `src/hooks/useCommunityGuides.ts` — fetch hook
- `supabase/migrations/*_community_guides.sql` — schema + RLS
- `supabase/migrations/20260817000000_content_feedback.sql` — `content_feedback` table + RLS
