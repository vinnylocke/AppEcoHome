# Plan — Calendar filters: text cut off on mobile

## Problem

On the dashboard **Calendar** view (`/dashboard?view=calendar`, `TaskCalendar.tsx`), opening **Filters** on a phone shows the **Location / Area / Garden Plan** dropdowns with their text clipped — you can't read the selected value or the options.

## Root cause

The three selects sit in a row at `TaskCalendar.tsx:574`:

```
<div className="flex flex-wrap sm:flex-nowrap gap-4 w-full xl:w-auto mt-2 sm:mt-0">
  <div className="flex-1 sm:w-40"> … Location select … </div>
  <div className="flex-1 sm:w-40"> … Area select … </div>
  <div className="flex-1 sm:w-48"> … Garden Plan select … </div>
</div>
```

Each wrapper is `flex-1` with **no min-width**, so even though the row is `flex-wrap`, the `flex-1` items shrink to share one line (~⅓ width each) instead of wrapping. On a ~375px phone that's ~95px per select; with `p-3` padding + the native dropdown arrow there's almost no room, so "All Locations" / "All Garden Plans" get cut off.

## App-reference consulted

- `docs/app-reference/02-dashboard/03-calendar-tab.md` — confirms the surface (`/dashboard?view=calendar`), the filter panel (Type chips / Location / Area / Plan), and that `TaskCalendar.tsx` owns it. No data-flow / gating change here — purely layout.

## Fix

Stack the three selects vertically on mobile, switch to a row at `sm`. One-line change to the wrapper at `TaskCalendar.tsx:574`:

```
flex flex-wrap sm:flex-nowrap gap-4  →  flex flex-col sm:flex-row gap-4
```

In `flex-col`, each `flex-1 sm:w-40` child stretches to full width (readable full-width selects on mobile); at `sm` the existing `sm:w-40` / `sm:w-48` fixed widths and row layout are unchanged. No change to the Task Type chips (they already wrap) or to desktop layout.

## Risks / scope

- Pure CSS class change; no logic, data, props, or desktop behaviour affected.
- Tablet/desktop (`sm:` and up) render exactly as before.

## Tests

- No unit/logic change. The calendar filter testids are unchanged, so existing E2E specs are unaffected. I'll verify the stacked layout in a narrow viewport before reporting done (and note it if I can't open a browser).

## Docs

- `03-calendar-tab.md` component-graph line for the filter panel is still accurate (Location / Area / Plan dropdowns) — no doc change needed beyond confirming it stays correct.

## Process

1. Edit the wrapper class in `TaskCalendar.tsx`.
2. `npx tsc --noEmit` + `npm run build`.
3. Release note (Fixed); deploy `--bump 1`; push to main.
