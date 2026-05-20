# Cookie Policy Modal

> Static-content modal showing Rhozly's cookie policy. Surfaced from the Auth screen footer and Account settings.

**Source file:** `src/components/CookiePolicyModal.tsx`

---

## Quick Summary

Mirror of [PrivacyPolicyModal](./20-privacy-policy.md) but focused on cookies / local storage / tracking. Bundled content, no network fetch.

---

## Role 1 — Technical Reference

### Component graph

```
CookiePolicyModal
├── Header (close, title)
├── Last-updated date
└── Scrollable body
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `onClose` | `() => void` | Hide |

### Data flow

None — static content.

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

None.

### Performance

Pure render.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

To see what cookies / local storage / device data Rhozly uses + how to opt out where possible.

### Every flow on this modal

#### 1. Read

- Scroll. Close when done.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

None.

### Recommended workflows

- Read once at signup. Re-read after major version bumps.

### What to do if something looks wrong

- **Out-of-date content:** check the last-updated date. File a bug if too old.

---

## Related reference files

- [Privacy Policy Modal](./20-privacy-policy.md)
- [Auth Screen](../01-onboarding/01-auth-screen.md)

## Code references for ongoing maintenance

- `src/components/CookiePolicyModal.tsx`
