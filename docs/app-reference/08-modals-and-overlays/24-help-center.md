# Help Center / App Help

> The App Help tab inside the Guides screen. Search-as-you-type over a bundled JSON of help articles about *using Rhozly*. Distinct from gardening guides — answers "how do I add a plant?", "where do I export data?", etc.

**Source files:**
- `src/components/AppHelpSearch.tsx` — search UI
- Bundled help articles JSON (likely `src/constants/helpArticles.ts` or similar)

---

## Quick Summary

Type a query → fuzzy filter against the bundled help articles → inline answer card. Each article has a title, body (markdown), and tag list. No network fetch — bundled with the client.

---

## Role 1 — Technical Reference

### Component graph

```
AppHelpSearch
├── Search input
├── Filtered article list
│   └── Article card → expandable answer
└── Empty state ("No matches — try Contact Support")
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| Inherited from parent | | |

### Data flow

- Static JSON loaded at build time.
- Fuzzy filter client-side (simple includes / substring match).

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
| No matches | "No matches — Contact Support" link |

### Performance

- Pure render.
- Search runs on every keystroke (string array).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this tab

For questions about *using Rhozly* — not about gardening. "How do I share my home with my partner?" "Where do I see release notes?" — these belong here.

### Every flow on this tab

#### 1. Type a question

- Live results as you type.

#### 2. Expand an article

- Tap card → inline expand.

#### 3. Still stuck

- Bottom CTA → Contact Support modal.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Confusing App Help with Guides.** Guides = gardening; App Help = using Rhozly.

### Recommended workflows

- **First port of call when stuck:** check here before emailing.

### What to do if something looks wrong

- **Out-of-date answer:** the bundled JSON didn't update. File a bug.

---

## Related reference files

- [Guides List](../05-tools/07-guides-list.md)
- [Contact Support Modal](./18-contact-support.md)

## Code references for ongoing maintenance

- `src/components/AppHelpSearch.tsx`
- Bundled help JSON constant
