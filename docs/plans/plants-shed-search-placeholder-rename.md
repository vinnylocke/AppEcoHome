# Plan — Plants page: rename search placeholder

**Problem:** The search input on the Plants (formerly The Shed) page reads *"Search plants…"*, which sounds like a global plant database search. The page actually searches the user's own saved plants only.

**App-reference consulted:** [docs/app-reference/03-garden-hub/01-the-shed.md](docs/app-reference/03-garden-hub/01-the-shed.md) — confirms this is a client-side filter over the user's `inventory_items`.

**Change:**
- `src/components/TheShed.tsx` line 1559 — `placeholder="Search plants..."` → `placeholder="Search your saved plants..."`
- Line 1560 — `aria-label="Search your plant library"` → `aria-label="Search your saved plants"` (drop "library" — that name is retired).

No other call sites use this string. The other two `Search plants…` placeholders (shopping AddItemSheet, GlobalSearch) are legitimately global and stay as-is.

**Tests / docs:** no test references the placeholder text; no app-reference update needed beyond the in-file string match.

**Release notes:** bundle with the next deploy as "Improved" — no need to ship in isolation.
