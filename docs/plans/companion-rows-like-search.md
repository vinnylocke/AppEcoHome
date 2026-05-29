# Plan — Companion rows behave like plant-search rows (ⓘ pills + open care guide)

## Goal
Under the Companions tab's Beneficial / Neutral / Harmful sections, each companion plant should feel like a plant-search result:
- click the **ⓘ** → reveal the **info pills + description** inline (the same `PlantInfoPanel` plant search uses), instead of today's image-only panel;
- click the **plant** → open its **full care guide** (`PlantDetailModal`: Care, Grow Guide, Companions, Light) — so you can drill into that companion's own grow guide / companions / light.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/36-plant-search.md` — the `<PlantSearch>` row + ⓘ preview + `PlantDetailModal`
- `docs/app-reference/08-modals-and-overlays/38-plant-detail-modal.md`

## Today
`CompanionPlantsTab` renders each companion as: a select **checkbox** (add-to-Shed), name + scientific name + reason, and an **ⓘ** that expands an `ImagePanel` (thumbnails + reason). Companions are name-only (`{ name, scientificName, reason }`) — no care data.

## Approach (reuse the shared pieces — modular)
The pills (`PlantInfoPanel`) and the care guide (`PlantDetailModal`) are already the shared components plant search uses. We resolve a companion *name* to plant data the same way:

1. **ⓘ → inline info pills + description.** On expand, resolve the companion's details once (cached per row): `searchLibrary(name, { pageSize: 1 })` → top `plant_library` row → `libraryRowToPlantDetails`. Render `<PlantInfoPanel details loading />` (the pills) with the companion **reason** shown as the description line above it. If the plant isn't in the library, show the reason + a "Open for full care" hint (no AI call for a lightweight peek). Replaces `ImagePanel`.
2. **Click the plant → care guide.** Tapping the name/row opens `PlantDetailModal` with a result built from the resolved data: library match → `{ _provider: "ai", common_name, scientific_name, plant_library_id }` (clones from the library, no Gemini); otherwise `{ _provider: "ai", common_name, scientific_name }` (the modal generates the guide on open). The modal then offers Care / Grow Guide / Companions / Light for that companion.
3. **Keep** the select checkbox + "in your shed" badge (the add-companions-to-Shed flow is unchanged).

State added to `CompanionPlantsTab`: a per-row details cache + loading set (for the ⓘ pills), and `detailResult` for the `PlantDetailModal`.

Reuses `searchLibrary`, `libraryRowToPlantDetails`, `PlantInfoPanel`, `PlantDetailModal` — all already shared, so the row/preview/care-guide experience has one definition across plant search and companions.

## Tests
- E2E (companions): expand a companion's ⓘ → info panel appears; click a companion → `PlantDetailModal` opens (resilient `if visible`, since companion data + library aren't seeded). Reuse the `plant-detail-modal` testid.
- Unit: none new (reuses covered helpers).

## App-reference docs
- `12-senescence.md` / companions notes + `36-plant-search.md` — note companion rows now share the ⓘ-pills + care-guide experience.

## Open decision
**Visual parity:** keep the current companion row layout (checkbox + reason) and just add the ⓘ-pills + click-to-care-guide *behaviour* (recommended — preserves the add-to-Shed checkbox + reason), **vs** restyle the rows to look pixel-identical to search result rows (thumbnail tile etc.), which would crowd out the checkbox/reason. Plan assumes **behaviour parity, keep the layout**.

## Risks
- Companions not in `plant_library` show no pills on the ⓘ peek (graceful: reason + "open for full care"); the full guide still works via AI on click. AI generation on opening an unknown companion uses quota (user-initiated). Untestable here → verify on device.

## Deploy
Frontend-only. One deploy, then push to `main`.
