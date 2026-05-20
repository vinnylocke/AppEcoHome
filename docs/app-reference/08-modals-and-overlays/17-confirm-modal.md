# Confirm Modal

> A reusable confirmation modal for destructive or significant actions. Used throughout the app — delete plan, archive plant, leave home, etc.

**Source file:** `src/components/ConfirmModal.tsx`

---

## Quick Summary

Standardised confirm UX with title, description, optional checkbox (e.g. "Also delete linked tasks"), Cancel and primary action. Calls `onConfirm` callback. Variants: default, destructive (red), warning.

---

## Role 1 — Technical Reference

### Component graph

```
ConfirmModal (Portal)
├── Header (icon, title)
├── Description body
├── Optional checkbox row
├── Cancel button
└── Confirm button (variant-styled)
```

### Props (typical)

| Prop | Type | Purpose |
|------|------|---------|
| `isOpen` | `boolean` | Render gate |
| `title` | `string` | Header |
| `description` | `string \| ReactNode` | Body |
| `confirmText` | `string` | Button label |
| `variant` | `"default" \| "destructive" \| "warning"?` | Styling |
| `optionalCheckbox` | `{ label, checked, onChange }?` | Per-action toggle |
| `onConfirm` | `() => void \| Promise<void>` | Action callback |
| `onClose` | `() => void` | Hide |
| `isProcessing` | `boolean?` | Show spinner on confirm button |

### Data flow

No data of its own — purely UI.

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

Inherits from parent action.

### Error states

Parent handles. Modal stays open on error so user can retry.

### Performance

- Lightweight portal mount.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this modal

The "are you sure?" pause before something dangerous. It exists so accidental taps don't delete your work.

### Every flow on this modal

#### 1. Read the description

- It tells you exactly what will happen.

#### 2. Optional checkbox

- Some confirms add a secondary choice ("Also delete X" / "Notify members").

#### 3. Cancel or Confirm

- Cancel = bail. Confirm = proceed.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Hitting Confirm reflexively.** Read first.
- **Misreading the description.** "Delete linked tasks" vs "Keep linked tasks" — opposite outcomes.

### Recommended workflows

- **Always read.** The friction is intentional.

### What to do if something looks wrong

- **Confirm fails:** modal stays — retry.

---

## Related reference files

- Used throughout the app — link from anywhere that warns before destructive action.

## Code references for ongoing maintenance

- `src/components/ConfirmModal.tsx`
