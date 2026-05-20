# Plant Guides Tab

> Lists curated + community guides linked to the species of the current plant instance. Lets the user browse care articles relevant to *this specific plant* without leaving the modal.

**Source file:** `src/components/PlantGuidesTab.tsx`

---

## Quick Summary

Searches `guides` + `community_guides` for entries tagged with this plant's common or scientific name. Cards link out to the full Guide Reader.

---

## Role 1 — Technical Reference

### Component graph

```
PlantGuidesTab
├── Loading state
├── Rhozly guides section (curated)
│   └── Guide card → opens GuideList reader for that entry
├── Community guides section
│   └── Guide card → opens CommunityGuideReader
└── Empty state ("No guides yet for this plant")
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plantName` | `string` | parent | For label/tag search |
| `scientificName` | `string?` | parent | Alternate search |

### Data flow — read paths

```ts
// Rhozly guides
supabase.from("guides")
  .select("*")
  .contains("labels", [plantName])    // or similar tag match
  .order("created_at", desc);

// Community guides
supabase.from("community_guides")
  .select("*")
  .or(`labels.cs.{${plantName}},labels.cs.{${scientificName}}`)
  .order("created_at", desc);
```

### Data flow — write paths

None — read-only.

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
| Empty | "No guides yet for this plant" |
| Fetch fails | Inline error |

### Performance

- Two parallel queries; cached client-side per modal session.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this tab

Care guides written about a specific species, surfaced in the right context. Open Tomato → see all tomato guides. Don't have to search.

### Every flow on this tab

#### 1. Browse Rhozly guides

- Tap a card → opens GuideList in reader mode.

#### 2. Browse Community guides

- Tap a card → opens CommunityGuideReader.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Expecting AI care guide here.** That's the separate "Care Guide" tab — AI-generated. This tab surfaces user-authored / curated articles.

### Recommended workflows

- **Stuck:** open the relevant species → check this tab for community wisdom.

### What to do if something looks wrong

- **Empty tab:** no one's written about this plant yet. Consider writing one yourself in the Community Guide Editor.

---

## Related reference files

- [Instance Edit Modal](./08-instance-edit-modal.md)
- [Guides List](../05-tools/07-guides-list.md)
- [Community Guide Editor](../05-tools/09-community-guide-editor.md)

## Code references for ongoing maintenance

- `src/components/PlantGuidesTab.tsx`
- `src/hooks/useCommunityGuides.ts`
