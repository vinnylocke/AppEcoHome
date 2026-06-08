# Plan — 23.0002: Documentation refresh

Wave B of the onboarding overhaul ([master plan](./onboarding-docs-master-audit.md)). Brings the 15 existing in-app docs up to date with everything shipped in Waves 19 → 22 and adds 6 new docs for features that have **no** in-app explanation today.

## What's stale (verified by grep)

`grep -l "Weekly Overview"`, `"Notes"`, `"Voice in Chat"`, `"Pl@ntNet"`, `"image credit"`, `"Garden AI"` across `documentation/*.md`:

| Search term | Files mentioning it |
|-------------|---------------------|
| Weekly Overview | 0 / 15 |
| Notes | 0 / 15 |
| Voice in Chat | 0 / 15 |
| Pl@ntNet | 0 / 15 |
| Image credit / licence | 0 / 15 |
| Garden AI (current branding) | 2 / 15 |

Every doc pre-dates Wave 21 (Weekly Overview, June 2026).

## Source of truth

Every Rhozly user-facing surface has a corresponding `docs/app-reference/*.md` file maintained alongside the code. Those are **internal** documentation (senior-dev + expert-gardener voices), but they're the authoritative description of what each surface does. **First draft of each user-facing doc will be summarised from the matching app-reference file**, then trimmed for the user-voice and stripped of dev internals.

That makes this wave fast and accurate — we don't have to re-discover what each surface does.

## Per-file changes (existing 15)

| File | Action | What changes |
|------|--------|-------------|
| [`01-getting-started.md`](../../documentation/01-getting-started.md) | Refresh | Mention Quick Access Home on mobile; add Notes + Weekly Overview to the "main surfaces" tour; update the "first-day" workflow to use the new pacing |
| [`02-dashboard.md`](../../documentation/02-dashboard.md) | Refresh | Add TodayFocusCard, WeekAheadPreview, SeasonalPicksCard sections. Remove references to the old empty-home stats grid |
| [`03-tasks.md`](../../documentation/03-tasks.md) | Refresh | Harvest window-task model (Wave 20), tombstones, postpone semantics, ghost-task explanation |
| [`04-schedule.md`](../../documentation/04-schedule.md) | Refresh | "Task Schedule" UI rename; mention pruning + harvesting blueprints with end_date now use the window model and skip `generate-tasks`; optimise tab update |
| [`05-the-shed.md`](../../documentation/05-the-shed.md) | Refresh | Library-first Add-to-Shed flow (post-22.0007 search rows now show credit badges); Pl@ntNet + Verdantly + Perenual sources explained; Nursery toggle on `/shed`; image credit badge on tiles |
| [`06-planner.md`](../../documentation/06-planner.md) | Refresh | Plan staging phase model; Garden Overhaul Sage+ flow; reference photos |
| [`07-shopping-lists.md`](../../documentation/07-shopping-lists.md) | Refresh | Multi-list CRUD; templates ("Starter Toolkit", "Seasonal Veg Patch"); "Add checked plants to Shed" confirmation toast (Wave 1's Wave 5 fix) |
| [`08-plant-doctor.md`](../../documentation/08-plant-doctor.md) | Refresh | "Plant Lens" rename; Pl@ntNet + Rhozly AI dual-tile output (Wave 21.0010); CC-BY-SA licence badge; image enlarge → in-app lightbox (Wave 21.0011 + 22.0005) |
| [`09-locations-areas.md`](../../documentation/09-locations-areas.md) | Refresh | Advanced metrics accordion; InfoTooltip-based help for pH/lux/water-movement; assignment chips |
| [`10-weather-intelligence.md`](../../documentation/10-weather-intelligence.md) | Refresh | 24-hour stale-alert expiry (Wave 21.0004); Weekly Overview's weather alerts section; Golden Hour notification |
| [`11-ailment-watchlist.md`](../../documentation/11-ailment-watchlist.md) | Refresh | AI tab default; tab renames; accordion behaviour |
| [`12-guides.md`](../../documentation/12-guides.md) | Refresh | Community guide editor; tags; bookmarks |
| [`13-tools.md`](../../documentation/13-tools.md) | Refresh | Add Sun Tracker AR, Companion Planting, Garden Layout 2D/3D, Light Sensor; remove anything renamed |
| [`14-profile-preferences.md`](../../documentation/14-profile-preferences.md) | Refresh | Voice section (Wave 22.0001); Quick Launcher customisation; persona settings |
| [`15-navigation-quick-add.md`](../../documentation/15-navigation-quick-add.md) | Refresh | Quick Launcher tile catalogue (16 destinations); Notes tile; Week Ahead tile; mobile vs desktop nav model |

## New docs (6)

Each follows the existing markdown structure: short overview → "What it does" → "How to" → "Tips" → "What if…". Each gets a `?raw` import added to `src/onboarding/docs.ts` so it appears in the Help Center Docs tab.

| File | Source app-reference | Sections (sketch) |
|------|---------------------|-------------------|
| **NEW** `16-notes.md` | [Notes](../app-reference/03-garden-hub/14-notes.md) | What Notes are; rich-text editor (headings/lists/checkboxes/tables/images); many-to-many linking; finding notes from entity pages |
| **NEW** `17-weekly-overview.md` | [Weekly Overview](../app-reference/02-dashboard/15-weekly-overview.md) | Where it lives; the seven sections; how it's regenerated; Sunday notification |
| **NEW** `18-voice-in-chat.md` | [Plant Doctor Chat](../app-reference/05-tools/03-plant-doctor-chat.md) | Mic button; read-aloud per message; auto-read toggle in Voice settings; how to talk + listen |
| **NEW** `19-image-credits.md` | [Image Sources](../app-reference/99-cross-cutting/24-image-sources.md) | Why we credit images; the badge popover; `/credits` page; what each provider's badge means |
| **NEW** `20-pl-ntnet-identification.md` | [Pl@ntNet](../app-reference/99-cross-cutting/38-plantnet.md) | Why Pl@ntNet runs first; CC-BY-SA; cross-check + AI fallback; what "Also from Rhozly AI" means |
| **NEW** `21-nursery-and-sowing.md` | [Nursery](../app-reference/03-garden-hub/10-nursery.md) | Seed packets; sowings; plant-out; sowing calendar; how it interacts with the Shed |

## Files modified

| File | Change |
|------|--------|
| All 15 existing `documentation/*.md` | Per-file refresh as above |
| **NEW** `documentation/16-notes.md` → `21-nursery-and-sowing.md` | 6 new files |
| [`src/onboarding/docs.ts`](../../src/onboarding/docs.ts) | 6 new `?raw` imports + 6 new `DocEntry` rows in the `DOCS` array |
| `documentation/README.md` | Update the file list |

## Quality bar per doc

- **Length**: 100–200 lines each (matches the existing avg of ~150 lines/doc).
- **Voice**: friendly, second-person ("you tap…"), zero dev jargon.
- **Structure**: H2 sections — "What this does", "How to", "Tips", "Common questions".
- **Cross-links**: each doc links to 1–2 related docs at the bottom.
- **No screenshots in 23.0002** — defer to 23.0003 where we re-shoot for the matching tours.

## Tests

- **Build smoke**: confirm all `?raw` imports resolve cleanly.
- **HelpCenterDrawer manual visual**: open each doc, confirm renders.

## Tier gating

None — docs are universally available.

## Deploy

Frontend-only. Minor bump → **23.0002**.

## Estimate

The 15 refreshes are mostly trim-and-update jobs; each takes ~10 minutes. The 6 new docs each take ~20 minutes (summarising from the existing app-reference). Total: ~5 hours of focused work, easily one wave.

## Risks

- **Drift between user docs and app-reference**: the rule [in CLAUDE.md](../../CLAUDE.md#app-reference-documentation-is-mandatory-for-all-code-changes) is that any feature change updates app-reference. If we stay disciplined, the user docs can be regenerated quickly the next time we do a refresh.
- **README.md stale**: trivial — one-line update.
- **No code logic risk**: pure content.
