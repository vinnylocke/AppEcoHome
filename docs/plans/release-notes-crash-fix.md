# Plan — Fix Release Notes modal crashing on the history view

## The bug

User taps "What's new" / version label in the profile dropdown → modal opens in **history** mode → React render throws → ErrorPage shows with error ID `RZ-VT93G2`.

## Root cause

The history view loops every row in `release_notes` and feeds each `section.items` array through `SectionBlock`. In Wave 6F I widened `ReleaseNoteItem` from `string` to `string | { text, link? }` and updated the renderer, but the type-narrowing isn't paranoid enough:

```tsx
const text = typeof item === "string" ? item : item.text;
```

If any item in the wild is `null`, `undefined`, a number, or an object without `.text`, this throws (`null.text` etc.) and brings down the entire modal. Old rows in the production table can plausibly contain any of those — there's no schema validation on the JSONB column.

There's also a secondary risk: if `section.items` is itself non-array (e.g. a stray object), `.map` would throw too.

## Fix

Two layers of paranoia in [src/components/ReleaseNotesModal.tsx](../../src/components/ReleaseNotesModal.tsx):

1. **In `SectionBlock`**: 
   - `Array.isArray(section.items)` guard before `.map`.
   - For each item, only accept a string or an object with a string `.text`. Anything else gets skipped (`return null`) so one bad row doesn't break the whole section.
   - Link is only used when `item.link.label` and `item.link.path` are both strings.

2. **Around the history loop**: wrap each `note` render in a small try/catch fallback so a single corrupt row gracefully shows "Could not display this version's notes" rather than blowing up the whole modal.

No schema or DB changes — purely defensive client-side hardening.

## Files

- `src/components/ReleaseNotesModal.tsx` — harden `SectionBlock` + add per-note error boundary.

## Verification

1. Type-check clean.
2. Manually open the modal in history mode in dev — should render unchanged for well-formed data.
3. Manually inject a malformed section item (string `null` value, missing `.text`) — section renders the valid items and silently skips the bad one.
4. After deploy, the user with error `RZ-VT93G2` should be able to open history without the crash.
