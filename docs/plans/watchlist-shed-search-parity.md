# Watchlist / Shed — mobile bulk-add visibility + search-modal parity + button rename

**Reported (phone, portrait):**
1. The **Bulk add** button isn't visible on the Watchlist tab and the Plants (Shed) tab.
2. The **search modals differ**: Watchlist "Add" (`AddAilmentModal`) vs Shed "Find a plant" (`BulkSearchModal`). Want them to look the same — **match the plant one**.
3. The Watchlist primary button is called **"Add"** while the Shed's is **"Find a plant"** — rename the Watchlist one to be in line with the Shed. (Open question: which name.)

## App-reference consulted
- `docs/app-reference/03-garden-hub/01-the-shed.md` — Shed toolbar (Find a plant / Bulk add / Select / Layout), `BulkSearchModal` entry point.
- `docs/app-reference/03-garden-hub/02-watchlist.md` — Watchlist toolbar (Add / Bulk add), `AddAilmentModal` + `BulkAddAilmentsModal`.
- `docs/app-reference/08-modals-and-overlays/04-bulk-search-modal.md` — the target design (`BulkSearchModal`).
- `docs/app-reference/99-cross-cutting/36-plant-search.md` — the shared `<PlantSearch>` engine `BulkSearchModal` uses.
- `docs/app-reference/99-cross-cutting/06-data-model-ailments.md` — ailment shapes + the library/Perenual/AI tiers the ailment search uses.

Source read: `src/components/TheShed.tsx` (toolbar ~1644-1693, modal wiring ~2544), `src/components/AilmentWatchlist.tsx` (toolbar ~1960-1979, `AddAilmentModal` ~424-1520), `src/components/BulkSearchModal.tsx` (target shell).

## Root causes

### 1. Bulk-add hidden on mobile
Both bulk-add buttons are `hidden sm:flex`, so below the `sm` (640px) breakpoint they never render:
- `TheShed.tsx:1687` — `shed-bulk-paste-btn` → `className="hidden sm:flex …"`
- `AilmentWatchlist.tsx:1968` — `watchlist-bulk-add-btn` → `className="hidden sm:flex …"`

The neighbouring Select / Layout buttons instead stay visible and hide only their **text** on mobile (`<span className="hidden sm:inline">…`). The bulk-add buttons should follow that same pattern.

### 2. The two search modals look different
- **Shed "Find a plant"** → `BulkSearchModal` (`src/components/BulkSearchModal.tsx`): full-screen centred shell (`z-[100]`, `max-w-3xl h-[85vh]`, `p-8` header with a `ListPlus` icon + muted uppercase subtitle), a **Search / Manual tab bar**, the shared `<PlantSearch>` engine, a "Paste a list" toggle, and a floating "Review & Add" selection footer.
- **Watchlist "Add"** → `AddAilmentModal` (inline in `AilmentWatchlist.tsx`): smaller shell (`z-[60]`, `max-w-2xl max-h-[92vh]`, `p-6` header `text-2xl`, no icon, **primary-coloured** subtitle), an amber hint banner, a bespoke tiered **library → databases → AI** flow (plain `<input>`, no tab bar), and a different result-row + review style.

**Important scoping note:** the two modals search *different things*. `BulkSearchModal` searches **plants** via the shared `<PlantSearch>` component; `AddAilmentModal` searches **ailments** (library ailments + Perenual pest/disease + AI ailment generation), which have a different data model and no shared search component. So "make them the same" = **visual/structural parity of the shell**, not swapping the search engine (that would be a functional rewrite and is out of scope). Concretely, align `AddAilmentModal` to `BulkSearchModal`'s look:
- Same modal frame: `z-[100]`, `max-w-3xl`, `h-[85vh]` (flex column, `overflow-hidden`), `rounded-3xl`, `bg-rhozly-surface-lowest`.
- Same header: `p-8 pb-4`, `text-3xl font-black` title with a leading icon, muted `text-rhozly-on-surface/40` uppercase subtitle, matching close button.
- Present the search tiers as a **tab bar** in the plant modal's style (`role="tablist"`, `bg-rhozly-surface-low p-1 rounded-2xl`) — e.g. **Library search / Manual** (databases + AI stay reachable inside the search tab exactly as today, just restyled).
- Match the search field styling, the result-row card styling, and the floating selection/"Review & Add" footer.
- Keep **all** existing ailment search + add logic, testids, tiers, and the review/bulk steps intact — this is a restyle, not a behaviour change.

### 3. Button name mismatch
`AilmentWatchlist.tsx:1976` — the primary CTA reads **"Add"** (`<Plus size={18} /> Add`), vs the Shed's **"Find a plant"** (`TheShed.tsx:1677`). Rename to a "Find a …" parallel. **DECIDED: "Find an ailment"** (mirrors "Find a plant", reuses the surface's own term). Scope for Issue 2 **DECIDED: restyle-to-match** — keep the ailment-specific search (library + Perenual + AI); align the look only.

## Planned changes

**Issue 1 — `src/components/TheShed.tsx` + `src/components/AilmentWatchlist.tsx`:** change each bulk-add button from `hidden sm:flex` to `flex` and wrap the "Bulk add" text in `<span className="hidden sm:inline">Bulk add</span>` (icon-only on mobile, matching the Select/Layout pattern). No testid or handler change.

**Issue 2 — `src/components/AilmentWatchlist.tsx` (`AddAilmentModal`):** restyle its shell/header/tab-bar/search-field/result-rows/footer to match `BulkSearchModal`. Logic, tiers, testids, and the review/bulk steps are unchanged.

**Issue 3 — `src/components/AilmentWatchlist.tsx:1976`:** rename the button label (per the human's chosen name) and update its `aria-label`/title to match.

## Tests
- **Playwright** (`tests/e2e/specs/` + the Watchlist / Shed Page Objects): assert the bulk-add buttons are visible at a phone-portrait viewport (e.g. 390×844); update the Watchlist Page Object's primary-CTA selector/label to the new name; add a smoke check that `AddAilmentModal` still opens and its search input works after the restyle.
- No unit/Deno changes (pure UI; no `src/lib` or `_shared` logic touched).

## Docs to update
- `docs/app-reference/03-garden-hub/02-watchlist.md` — new button name; note the `AddAilmentModal` shell now mirrors `BulkSearchModal`; bulk-add visible on mobile.
- `docs/app-reference/03-garden-hub/01-the-shed.md` — bulk-add visible on mobile (icon-only).
- `docs/e2e-test-plan/` — update the Watchlist/Shed rows for the renamed button + mobile-visibility test.

## Risks / edge cases
- The `AddAilmentModal` restyle is the largest piece — it must preserve every tier (library/databases/AI), the manual-create steps, symptoms, the review cart, and all `data-testid`s so existing E2E specs keep passing. It's a className/layout reshape, not a rewrite.
- Toolbar crowding on very narrow phones: icon-only bulk-add matches the existing Select/Layout treatment, so the row stays within width.
- Renaming the button changes a user-facing label + any E2E selector keyed to "Add" text — the Page Object update covers this.
