# Privacy Policy Modal

> Static-content modal showing Rhozly's privacy policy. Linked from the Auth screen footer, account deletion flow, and Settings.

**Source file:** `src/components/PrivacyPolicyModal.tsx`

---

## Quick Summary

A scrollable markdown-rendered policy document. Content is bundled with the app (no network fetch). Updated alongside major releases when policy changes.

---

## Role 1 — Technical Reference

### Component graph

```
PrivacyPolicyModal
├── Header (close, title)
├── Last-updated date
└── Scrollable policy body
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

- Pure render.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

Standard policy reading — what Rhozly does with your data. Required for GDPR + Apple/Google store policies.

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

- **Out-of-date content:** check the last-updated date. If much older than expected, file a bug.

---

## Related reference files

- [Auth Screen](../01-onboarding/01-auth-screen.md)
- [Cookie Policy Modal](./21-cookie-policy.md)
- [Delete Account Modal](../06-account/08-delete-account.md)

## Code references for ongoing maintenance

- `src/components/PrivacyPolicyModal.tsx`
- Body content typically inlined; update there.
