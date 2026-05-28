# UI Wave 9 — Accessibility pass

## Goal

The audit (CC5) asked for a sweep over: tap targets, contrast, focus rings, keyboard nav, aria labels, modal a11y. Investigation found most of this is already shipped:

| Audit ask | Status |
|---|---|
| Global `:focus-visible` ring on all controls | ✅ Already in `src/index.css` (`button:focus-visible, a:focus-visible, [role="button"]:focus-visible, …`) |
| `prefers-reduced-motion` support | ✅ Already in `src/index.css` — strips animations except loaders |
| High-contrast mode | ✅ Already wired — `html.high-contrast` overrides + Account Settings toggle |
| Skip-to-content link | ✅ Already in `src/App.tsx:1060` — sr-only with focus reveal |
| All modals `role="dialog"` / `role="alertdialog"` | ✅ 29 modals tagged |
| All modals `aria-modal="true"` | ✅ 29/29 covered |

What's genuinely missing — the scoped Wave 9 work:

### 1. Modal accessible-name gap (the only real gap)

**23 of 29 modals tagged `role="dialog"` are missing `aria-labelledby`**, so screen readers announce them anonymously ("dialog") with no title. The fix is mechanical: add `id="<modal>-title"` to the existing heading and `aria-labelledby="<modal>-title"` on the dialog root.

Top-traffic modals to fix:

| File | Heading source for `id` |
|---|---|
| `src/components/PlantEditModal.tsx` | the `<h2>` in the modal header |
| `src/components/AddTaskModal.tsx` | the modal `<h2>` |
| `src/components/TaskModal.tsx` | the modal `<h2>` |
| `src/components/PlantAssignmentModal.tsx` | the modal `<h2>` |
| `src/components/NewPlanForm.tsx` | the modal `<h2>` |
| `src/components/planner/OverhaulPlanForm.tsx` | the wizard heading |
| `src/components/InstanceEditModal.tsx` | the modal `<h2>` |
| `src/components/PlantScheduleGenerateTasksModal.tsx` | the modal `<h2>` |
| `src/components/MobileNavDrawer.tsx` | "Menu" / nav heading |
| `src/components/ReleaseNotesModal.tsx` | "What's new" |
| `src/components/SpriteWizardModal.tsx` | wizard step heading |
| `src/components/PlantSourcePicker.tsx` | the modal `<h2>` |
| `src/components/LinkAilmentModal.tsx` | the modal `<h2>` |
| `src/components/AreaScanModal.tsx` | the modal `<h2>` |
| `src/components/ContactSupportModal.tsx` | the modal `<h2>` |
| `src/components/CookiePolicyModal.tsx` | "Cookie Policy" |
| `src/components/PrivacyPolicyModal.tsx` | "Privacy Policy" |
| `src/components/integrations/AutomationModal.tsx` | the wizard heading |
| `src/components/integrations/ConnectDeviceWizard.tsx` | wizard step heading |
| `src/components/integrations/DeviceDetailModal.tsx` | device name heading |
| `src/components/integrations/DeviceSettingsModal.tsx` | "Device Settings" |
| `src/components/shopping/AddItemSheet.tsx` | "Add Item" |
| `src/components/shopping/AddToListSheet.tsx` | "Add to Shopping List" |
| `src/components/ConfirmModal.tsx` | the `<p role="alert">` (already exists — wire `aria-labelledby` to its id) |

That's 24 small edits, each a 2-line change (one id, one aria attr). No prop changes, no logic touched.

### 2. Icon-only close-button labels — spot fixes

Many modals have an icon-only `<X />` close button without `aria-label`. The fix:

```tsx
<button onClick={onClose} aria-label="Close" data-testid="modal-close">
  <X size={18} />
</button>
```

Pass: same 8 high-traffic modals as Step 1 — only patch missing labels where they aren't already there.

### 3. Live-region wiring for form errors (deferred — note only)

Forms that show inline error text (e.g. PlantEditModal save errors) should wrap that text in `<div role="alert" aria-live="polite">` so screen readers announce it on display. **Defer** — would need a careful sweep of every form's error rendering, and most error feedback is already shown via toast (which is a separate live region concern).

## Sensible-default decisions

| Decision | Choice |
|---|---|
| Full-codebase aria-label sweep over every icon-only button | **Defer** — there are 220 components; only the most-touched modals are worth a targeted fix this wave. The global `:focus-visible` rule already covers most keyboard nav. |
| Full contrast audit of every `text-rhozly-on-surface/30` usage | **Defer** — the high-contrast toggle (already shipped) is the user-facing answer for low-vision users. Bulk opacity swaps are a future palette refresh, not a wave. |
| Tap-target audit (≥44×44px) | **Defer** — Wave 1–8 already pushed `min-h-[40px]` on most action buttons. A second pass with the Lighthouse audit is the right cadence, not this wave. |
| Live region wiring for form errors | **Defer** — see step 3 above. |
| Trap focus inside modals on Tab cycle | **Defer** — most modals already use `trapRef` patterns (see `ConfirmModal`). A shared `useModalFocusTrap` hook would be the right refactor but it's a separate workstream. |

## App-reference files consulted

- [`docs/app-reference/99-cross-cutting/20-error-handling.md`](docs/app-reference/99-cross-cutting/20-error-handling.md) (error patterns — relevant to deferred step 3)

No dedicated accessibility cross-cutting doc exists yet. This wave will create one.

## Files

| File | Change |
|---|---|
| 23 modal `.tsx` files (see table above) | Add `aria-labelledby="<modal>-title"` + `id="<modal>-title"` on heading |
| 8 modal `.tsx` files (high-traffic subset) | Add `aria-label="Close"` to icon-only X close buttons where missing |
| `docs/app-reference/99-cross-cutting/33-accessibility.md` | **New file** — documents the focus-visible rule, reduced-motion CSS, high-contrast toggle, skip-link, and the modal `role`/`aria-modal`/`aria-labelledby` pattern as the canonical accessibility contract for future surfaces. |
| `docs/app-reference/00-INDEX.md` | Add `33-accessibility.md` row to the cross-cutting section. |

No new tests — these are aria attribute additions; existing E2E tests already cover modal open/close. Adding tests for screen-reader announcement is out of scope for this wave.

## Steps

1. Add `aria-labelledby` + `id` on heading to each modal in the table (23 files).
2. Add `aria-label="Close"` to icon-only close buttons in the 8 high-traffic modals where missing.
3. Create `docs/app-reference/99-cross-cutting/33-accessibility.md`.
4. Update `docs/app-reference/00-INDEX.md`.
5. Typecheck + tests + deploy.

## Re-rating target

All surfaces should be at or above the **95+ target** post Wave 9 — accessibility was the last load-bearing CC concern blocking that score across the board.
