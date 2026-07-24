# Capture Sheet

> **The phone's in-garden capture hub** — a bottom sheet opened by the Deck's centre **Capture** FAB that puts "diagnose a plant" front-and-centre and folds the desktop header "+" create verbs into one thumb-reachable place. It is a **router**: every tile deep-links into an existing surface's own flow — zero duplicated capture logic.

**Route / how to reach it:** No route of its own. Opened by tapping the raised centre **Capture** FAB in the mobile [Deck](../09-persistent-ui/11-bottom-tab-bar.md) (`bottom-tab-capture`), which fires `setCaptureSheetOpen(true)` in `App.tsx`.
**Source files (entry points):**
- `src/components/CaptureSheet.tsx`
- `src/App.tsx` — `captureSheetOpen` state + app-level mount + `onNavigate`

---

## Quick Summary

Phase 6b moved create/capture off the mobile header and onto the Deck. Tapping the green **+** slides up this sheet: a hero **Diagnose a plant** action on top, then a 2×2 grid of the everyday verbs — add a plant, journal note, add a task, garden walk. Every button closes the sheet and navigates into the destination surface's existing `?open=…` flow, so there is no duplicated logic here — it's a launcher, phone-tuned, that also subsumes what the desktop header "+" (GlobalQuickAdd) offers.

---

## Role 1 — Technical Reference

### Component graph

- `CaptureSheet` (`src/components/CaptureSheet.tsx`) — the sheet body; renders the hero button + a 2×2 grid of action buttons.
- `ModalShell` (`src/components/ui/ModalShell.tsx`) — the chrome: portal, dimmed backdrop, focus trap, Escape-to-close, entrance motion. Rendered in `sheet` mode (`rounded-t-3xl`, bottom-pinned on phones), `closeOnOverlay`, `z={Z.modal}`, `data-testid="capture-sheet"`, `aria-label="Capture"`.
- Lucide icons: `Stethoscope` (hero), `Sprout`, `PenLine`, `CheckSquare`, `Footprints` (grid).

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `open` | `boolean` | `App.tsx` `captureSheetOpen` | Open/closed state |
| `onClose` | `() => void` | `App.tsx` `setCaptureSheetOpen(false)` | Dismiss (overlay click, Escape, or after a tile navigates) |
| `onNavigate` | `(url: string) => void` | `App.tsx` `(url) => navigate(url)` | Router push into the chosen flow |

### State (local)

None. The sheet is fully controlled by `open` / `onClose`; action definitions (`HERO`, `ACTIONS`) are module-level constants. The one internal helper is `go(url)` → `onClose()` then `onNavigate(url)`.

### Data flow — read paths

None. The sheet fetches nothing — it is a pure launcher.

### Data flow — write paths

None directly. Each tile performs a **navigation**, not a mutation; the destination surface owns any writes:

| Tile | testid | Navigates to | Destination flow |
|---|---|---|---|
| **Diagnose a plant** (hero) | `capture-diagnose` | `/doctor` | Plant Doctor (identify / diagnose / pest scan) |
| Add a plant | `capture-add-plant` | `/shed?open=add-plant` | The Shed → Add-to-Shed source picker |
| Journal note | `capture-journal` | *(opens an in-sheet chooser — no direct nav, #8)* | Chooser: **New journal entry** (`capture-journal-entry` → `/journal?open=add-entry`, the event-anchored composer) or **Add a note** (`capture-journal-note` → `/journal?tab=notes&open=add-note`, the Notes new-note editor). A back button (`capture-journal-back`) returns to the verbs. |
| Add a task | `capture-add-task` | `/dashboard?view=calendar&open=add-task` | Calendar → Add Task modal |
| Garden walk | `capture-walk` | `/walk` | Garden Walk (focus-mode plant-by-plant tour) |

The `?open=…` / `?view=…` params are consumed by each destination's own URL-state parser — the same contract [Global Quick Add](./23-global-quick-add.md) uses.

### Edge functions invoked

None. (The destinations may invoke their own — e.g. Plant Doctor's Gemini vision calls — but the sheet itself invokes nothing.)

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None.

### Tier gating

None at this surface — it opens for every tier. Gating lives at the destinations (e.g. Plant Doctor AI is Sage+; Garden Walk / Add Plant / Journal / Add Task are ungated).

### Beta gating

None.

### Permissions / role-based UI

None at this surface; destinations enforce their own permission keys.

### Error states

None catchable here — navigation only. If a destination's `?open=…` handler isn't wired, the surface simply opens without auto-opening its modal (same failure mode as Global Quick Add).

### Performance notes

- **Lazy-loaded** — `CaptureSheet` is `lazyWithRetry`-imported in `App.tsx` and wrapped in `<Suspense fallback={null}>`.
- **Mounted only on phone / focus mode** — the app-level mount is guarded `(isFocusMode || !isMdBreakpoint)`, so desktop never pays for it (desktop create runs through the header "+").
- Entrance is `ModalShell`'s standard `slide-in-from-bottom-4` + `zoom-in-95` / `fade-in` — compositor-only.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

You're outside, phone in one hand, and something needs doing *right now* — a leaf looks wrong, you just planted something, a thought you don't want to lose. The Capture sheet is the one button for all of that. It leads with the thing you most often reach for outdoors — **Diagnose a plant** — and keeps the everyday "I need to jot / add / start something" verbs one tap below, so you never have to hunt through menus with soil on your fingers.

For **Sarah** (amateur): it's the friendly green **+** that says "what do you want to do?" and then just does it. For **Marcus** (expert): it's a fast, predictable launcher — the same five actions in the same place every time, each dropping you straight into the real flow with no detour.

### Every flow on this page

1. **Diagnose a plant (the hero).** The big green bar at the top. Tap it → the sheet closes and you land in **Plant Doctor**, ready to point the camera at a leaf or problem. This is the flow the whole sheet is built around — it's why the Deck's centre button exists.
2. **Add a plant.** Tap → the Shed opens with the Add-to-Shed picker already up, so you can search or add from a source without an extra tap.
3. **Journal note.** Tap → an in-sheet chooser (#8): **New journal entry** (opens the event-anchored Journal composer) or **Add a note** (opens the Notes tab's new-note editor). This stops the one button from forcing a journal entry when you actually wanted a free-form note.
4. **Add a task.** Tap → the Calendar opens with the Add Task modal ready — a one-off or today's job.
5. **Garden walk.** Tap → starts the guided, bed-by-bed **Garden Walk** so you can tend everything in one pass.

Each tile does the same two things: it closes the sheet, then it takes you where you were headed. Nothing is created *in* the sheet — it hands you off to the proper flow.

### Information on display — what every field means

| Element | Meaning |
|---|---|
| "Capture" heading + grab-handle | You're in the capture hub; swipe down or tap outside to dismiss |
| **Diagnose a plant** (green hero, stethoscope) | The flagship action — opens Plant Doctor |
| Grip hint text under each tile | What that verb does ("To your Shed", "Jot something down", "One-off or today", "Tend bed by bed") |
| 2×2 grid | The everyday create verbs, in muscle-memory order |

### Tier-by-tier experience

The sheet looks identical for **Sprout / Botanist / Sage / Evergreen** — same five actions, always. The only tier difference shows up *after* you tap **Diagnose a plant**: Plant Doctor's AI diagnosis is a Sage+ capability, and it gates there, not here. Add Plant, Journal, Add Task, and Garden Walk are available to everyone.

### New user vs returning user vs power user

- **Brand new user** (no plants yet): the hero nudges toward Diagnose, but **Add a plant** is the natural first tap to start building the Shed.
- **Returning user**: this is the daily "capture what I just saw" button — journal a change, add a task, snap a diagnosis.
- **Power user** (lots of plants): **Garden walk** turns the sheet into the entry point for a full tending pass across every bed.

### Beta user experience

No difference — nothing beta-only appears here.

### Common mistakes / pitfalls

- **Expecting to *finish* a task inside the sheet.** It doesn't create anything itself — every tile hands you to the real flow (the Shed picker, the Journal composer, the Add Task modal). That's by design: one source of truth per action.
- **Looking for it on a tablet or desktop.** The sheet is phone / focus-mode only. On wider screens the header "+" (Quick Add) does the same job.
- **Wondering where "Diagnose" went.** It used to be a bottom-bar Doctor tab; now it's the hero of this sheet. Tap the green **+**, then the top bar.

### Recommended workflows

1. **Something's wrong with a plant** → **+** → **Diagnose a plant** → point the camera.
2. **I just planted / bought something** → **+** → **Add a plant** → search or add from source.
3. **Do the rounds** → **+** → **Garden walk** → tend bed by bed with the summary at the end.

### What to do if something looks wrong

- **A tile opens the screen but no modal pops up:** the destination's `?open=…` handler may be mis-wired — report the URL; the sheet itself only navigates.
- **The + doesn't open anything:** the sheet only mounts on phones / focus mode. On a tablet-width viewport, use the header "+" instead.
- **Sheet won't dismiss:** tap the dimmed area outside it, or press Escape — it's a standard modal shell.

---

## Related reference files

- [Bottom Tab Bar — "The Deck"](../09-persistent-ui/11-bottom-tab-bar.md) — the Capture FAB that opens this sheet
- [Header / Top Bar](../09-persistent-ui/01-header.md) — the desktop "+" this sheet folds in on phones
- [Global Quick Add](./23-global-quick-add.md) — the desktop create menu with the same deep-link contract
- [Plant Doctor](../05-tools/02-plant-doctor.md) — the Diagnose hero's destination
- [The Shed](../03-garden-hub/01-the-shed.md) — Add-a-plant destination (`?open=add-plant`)
- [Global Journal](../03-garden-hub/11-global-journal.md) — Journal-note destination (`?open=add-entry`)
- [Add Task / Edit Schedule Modal](./01-add-task-modal.md) — Add-a-task destination (`?open=add-task`)
- [Garden Walk](../02-dashboard/13-garden-walk.md) — Garden-walk destination (`/walk`)
- [Routing](../99-cross-cutting/21-routing.md) — how the `?open=…` params are parsed

## Code references for ongoing maintenance

- `src/components/CaptureSheet.tsx` — `HERO` + `ACTIONS` registries, `go(url)` helper, ModalShell `sheet` render
- `src/App.tsx` — `captureSheetOpen` state, the `(isFocusMode || !isMdBreakpoint)` app-level mount, `onNavigate={(url) => navigate(url)}`
- `src/components/ui/ModalShell.tsx` — `sheet` mode, `z`, `data-testid`, focus-trap contract
- `src/components/ui/zIndex.ts` — `Z.modal` (120), the sheet's stacking level
