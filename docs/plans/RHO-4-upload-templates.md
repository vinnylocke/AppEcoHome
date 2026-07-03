# RHO-4 — Upload Templates (bulk CSV upload + downloadable templates)

**Ticket:** [RHO-4](https://rhozly.atlassian.net/browse/RHO-4) · Feature · Medium · Status at planning time: To Do
**Plan status:** awaiting approval — no implementation yet.

---

## 1. Goal

The ticket asks for three things (verbatim intent):

1. **Extend bulk upload to the Watchlist** — pests, diseases (and invasive plants) can currently only be added one at a time; plants and seed packets already have a bulk "Paste a list" flow.
2. **Extend the uploadable fields** — the current bulk paste extracts only `common_name / variety / quantity / notes` (plants) and `name / vendor / dates / qty` (seed packets). A user should be able to upload a CSV carrying **every field the manual-create form exposes** for that record type (e.g. plants: watering min/max days, sunlight, cycle, toxicity flags, …).
3. **Downloadable template files** — at every upload point, a template the user can download showing all fields + the required format. CSV is the suggested format.

## 2. App-reference files consulted

- `docs/app-reference/03-garden-hub/01-the-shed.md` — Shed component graph, bulk-paste history (Sprint 4a), `saveToShed` write path, tier gating, permissions (`shed.add`).
- `docs/app-reference/03-garden-hub/02-watchlist.md` — Watchlist component graph, tiered Add-ailment search, manual `StepBuilder` form, permissions (`ailments.add`), `SOURCE_META` badges.
- `docs/app-reference/03-garden-hub/10-nursery.md` — Nursery packet lifecycle, `BulkPasteSeedPacketsModal` two-step flow, `createSeedPacket` per-row insert, unlinked-packet convention (plant name preserved in `notes` provenance line).
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — `plants` columns, `plants_source_check` (`manual|api|ai|verdantly`), species-vs-instance split, AI catalogue columns (not touched by this feature).
- `docs/app-reference/99-cross-cutting/06-data-model-ailments.md` — `ailments` schema (name, type CHECK, symptoms/prevention_steps/remedy_steps jsonb, `ailments_source_check` incl. `library`), `plant_instance_ailments` (not touched).
- `docs/app-reference/99-cross-cutting/25-plant-providers.md` — provider/source semantics, entitlement clamping, why manual is always available on every tier.

Source read end-to-end: `src/components/BulkPastePlantsModal.tsx`, `src/lib/parsePlantList.ts`, `src/lib/parseSeedPackets.ts`, `src/lib/saveToShed.ts`, `src/components/ManualPlantCreation.tsx`, `src/components/AilmentWatchlist.tsx` (form types + StepBuilder), `src/components/nursery/BulkPasteSeedPacketsModal.tsx` (save path + notes provenance), `supabase/functions/parse-plant-list/index.ts`, `supabase/migrations/20260429000000_ailments_watchlist.sql`, `20260429100000_ailments_add_archived.sql`, `20260824000000_ailment_library_source.sql`, `20260624000500_nursery.sql`.

## 3. Format decision — CSV, and how it coexists with AI paste

### Decision: CSV with a header row

- **First row = canonical headers** (exact, case-insensitive on parse). Column order is free; unknown columns produce a warning, not a failure.
- **RFC 4180 quoting** — fields containing commas, quotes, or newlines are double-quoted; embedded quotes doubled.
- **Multi-value cells** use `;` as the intra-cell separator (e.g. `sunlight` = `full sun; part shade`). Semicolon avoids fighting the comma delimiter and survives Excel round-trips.
- **Booleans** accept `true/false`, `yes/no`, `y/n`, `1/0` (case-insensitive). Templates show `true/false`.
- **Dates** are ISO `YYYY-MM-DD`; the seed-packet parser additionally accepts `YYYY-MM` and `Month YYYY` (reusing the existing `parseDatePhrase` semantics: purchased/opened → first of month, sow_by → last of month).

### Excel-compat caveats (explicit handling)

- **Downloads carry a UTF-8 BOM** (`﻿` prefix) so Excel on Windows opens accented plant names correctly instead of mojibake.
- **Delimiter sniffing on upload**: many European Excel locales export with `;` as the field delimiter. The parser sniffs the header row — if it splits into more known headers on `;` than on `,` (or on tab, covering "paste from Excel" TSV), that delimiter wins. Because we also use `;` intra-cell, sniffing happens on the **header row only** (headers never contain `;` themselves) — unambiguous.
- Templates ship with a second row of **example data** and a third commented guidance row is *not* included (Excel users delete rows accidentally; instead the format guide lives in the modal UI and the example row is clearly marked `EXAMPLE — delete this row`... actually simpler: the parser silently skips any row whose first cell starts with `EXAMPLE`).
- CRLF/LF both accepted.

### Keep the AI free-text paste? Yes — both paths, side by side

The existing paste flow is genuinely good for "I scribbled 30 plants on my phone" input; strict CSV is for spreadsheet people and for the full-field promise of this ticket. **Recommendation: both.**

- The bulk modals gain a **mode toggle**: **"Paste a list"** (existing free-text → AI/regex parse, unchanged) and **"Upload CSV"** (new: file input + strict parse against the field registry). Both feed the **same review step**.
- The CSV path is **deterministic and tier-free** — no Gemini call, no `ai_enabled` gate, works identically on Sprout. (The AI paste path keeps its existing Sage+ / regex-fallback split.)
- Watchlist gets a new bulk modal with the same two modes (free-text watchlist paste is a new, small AI/regex parser — see Phase 2; if scope pressure appears, the Watchlist can launch CSV-only and add AI paste later — flagged as an open question).

## 4. The field registry — single source of truth

**Decision: generated client-side from a field-registry module, not static files in `public/`.**

Why not `public/` static CSVs: they drift. Every time the manual form gains/renames a field, someone must remember to regenerate three files; nothing enforces it. A registry module means the template download, the CSV parser, the per-field validation, and (via unit tests) the manual form's payload shape all read **one definition** — they cannot drift from each other, and a parity unit test pins the registry to the actual insert payload keys.

New module: `src/lib/uploadTemplates/` (pure, no React — per `src/lib/` convention):

```
src/lib/uploadTemplates/
  types.ts        — FieldSpec, RecordTemplate, RowIssue, ParsedRow<T>
  registry.ts     — PLANT_TEMPLATE, AILMENT_TEMPLATE, SEED_PACKET_TEMPLATE
  csv.ts          — RFC-4180 tokenizer + serialiser (BOM, delimiter sniffing) — no dependency
  parse.ts        — parseCsv<T>(text, template) → { rows, issues } (per-row, per-field errors)
  template.ts     — buildTemplateCsv(template) → string (headers + example row), downloadTemplate()
```

`FieldSpec` (per column):

| Prop | Meaning |
|------|---------|
| `header` | canonical CSV header, e.g. `watering_min_days` |
| `label` | human label for the UI/template docs |
| `required` | boolean |
| `kind` | `text · int · bool · date · enum · enum-multi · list · steps · symptoms` |
| `enumValues?` | allowed values (for enum kinds) |
| `maxLen? / min? / max?` | limits |
| `example` | value used in the template's example row |
| `apply(value, row)` | writes the parsed value into the insert payload |
| `crossValidate?` | row-level checks (e.g. watering min ≤ max) |

Enum matching is case-insensitive with light normalisation (e.g. `Invasive Plant` → `invasive_plant`, `partial shade` → `part shade`); unknown enum values are per-field errors, not row-killers, unless the field is required.

## 5. Per-type field matrices

### 5.1 Plants (target: `plants` row via `saveToShed`, `source='manual'`)

The authoritative field set is `ManualPlantCreation.tsx`'s `cleanPayload` (what the manual form actually saves) plus the three bulk-paste extras (variety/quantity/notes). Note: the form's internal state has `hardiness_min/max`, `salt_tolerant`, `thorny`, `invasive`, `flowers`, `leaf`, `edible_leaf` but `cleanPayload` deliberately strips them (they aren't `plants` columns) — the CSV matches `cleanPayload`, not the form state.

| CSV header | Required | Type / validation | Maps to |
|---|---|---|---|
| `common_name` | **yes** | text ≤120 | `plants.common_name` |
| `variety` | no | text ≤120 | `plant_metadata.variety` + lowercase label (same as current bulk paste) |
| `quantity` | no | int 1–999 | `plant_metadata.bulk_import_notes` ("Bulk import: N plants") — species vs instance split means no `inventory_items` are created here (matches current behaviour; assignment happens in the Shed) |
| `scientific_name` | no | `;`-list, each ≤120 | `plants.scientific_name` (jsonb array) |
| `description` | no | text ≤2000 | `description` |
| `plant_type` | no | text ≤60 (suggested: Shrub/Tree/Flower/Vegetable/Houseplant; free text tolerated — form does the same) | `plant_type` |
| `cycle` | no | enum-ish: Perennial/Annual/Biannual/Herbaceous Perennial (free tolerated, form renders stored value); default `Perennial` | `cycle` |
| `care_level` | no | Beginner/Intermediate/Advanced (default Beginner) | `care_level` |
| `growth_rate` | no | Slow/Medium/Fast (default Medium) | `growth_rate` |
| `maintenance` | no | Low/Medium/High (default Low) | `maintenance` |
| `watering_min_days` | no | int 1–365 | `watering_min_days` |
| `watering_max_days` | no | int 1–365, **≥ min** (cross-validate) | `watering_max_days` |
| `sunlight` | no | enum-multi: full sun / part sun / part shade / filtered shade / full shade | `sunlight` (jsonb array) |
| `flowering_season` | no | enum-multi: Spring/Summer/Autumn/Winter/Year-round | `flowering_season` |
| `harvest_season` | no | same enum-multi | `harvest_season` |
| `pruning_month` | no | enum-multi: Jan…Dec | `pruning_month` |
| `propagation` | no | enum-multi: Seed/Bulb/Cuttings/Division/Layering/Grafting | `propagation` |
| `attracts` | no | enum-multi: Bees/Butterflies/Hummingbirds/Ladybugs/Moths | `attracts` |
| `indoor`, `is_edible`, `drought_tolerant`, `tropical`, `is_toxic_pets`, `is_toxic_humans`, `medicinal`, `cuisine` | no | bool (default false) | matching bool columns |
| `labels` | no | `;`-list | `labels` |
| `notes` | no | text ≤400 | appended into `plant_metadata.bulk_import_notes` |

**Deliberately excluded:** `thumbnail_url` / images (a CSV can't carry a photo; accepting arbitrary URLs invites hotlink/abuse problems — image picking stays a per-plant UI action; open question below), `hardiness_min/max` (not persisted by the manual form today), AI-catalogue columns (`care_guide_data` etc. — server-managed).

**Provider enrichment interaction:** CSV rows insert as `source='manual'` — user-supplied fields are **authoritative** and no Perenual/Verdantly/AI lookup runs during import (deterministic, free on every tier, no rate-limit exposure). Because we route through `saveToShed`, the richer CSV fields now actually do work the paste flow couldn't: `watering_min/max_days`, `harvest_season`, and `pruning_month` feed `buildAutoSeasonalSchedules`, so CSV-imported plants get real auto-schedules. Users can later enrich any manual plant via the existing per-plant flows; a bulk "enrich from Library" pass is out of scope (noted as future work).

### 5.2 Ailments / Watchlist (target: `ailments` row, `source='manual'`)

Authoritative set: the manual `StepBuilder` form in `AilmentWatchlist.tsx` + the `20260429000000` schema.

| CSV header | Required | Type / validation | Maps to |
|---|---|---|---|
| `name` | **yes** | text ≤120 | `name` |
| `type` | **yes** | enum: pest / disease / invasive_plant (accepts "invasive plant", "invasive") | `type` (DB CHECK) |
| `scientific_name` | no | text ≤120 | `scientific_name` |
| `description` | no | text ≤2000 | `description` (DB default `''`) |
| `affected_plants` | no | `;`-list | `affected_plants` (text[]) |
| `symptoms` | no | `;`-separated entries; each entry `title` with optional ` [mild|moderate|severe]` suffix (default mild). e.g. `Sticky leaves [moderate]; Curled shoots` | `symptoms` jsonb — each entry → `{id, title, severity, description:"", location:""}` |
| `prevention_steps` | no | `;`-separated step titles | `prevention_steps` jsonb — each → full `AilmentStep` with defaults (`task_type:'inspect'`, `frequency_type:'once'`, `step_order` by position) |
| `remedy_steps` | no | same | `remedy_steps` jsonb, same defaults |

**Nested-shape decision:** symptoms and steps are arrays of objects in the DB. A flat CSV can't express every sub-field without either exploding into dozens of numbered columns (`symptom_1_title, symptom_1_severity, …` — hostile) or inventing a dense mini-syntax. v1 keeps the cell grammar to **title + optional severity** (symptoms) and **title only** (steps); full step configuration (task_type, frequency, product) stays in the detail-edit UI, exactly like the review-then-refine model the plant paste already uses. This is the main open question for the approver (§12 Q2).

`source='manual'`, `thumbnail_url` excluded (same reasoning as plants). `perenual_id` excluded (provider-owned).

### 5.3 Seed packets (target: `seed_packets` row via `nurseryService.createSeedPacket`)

Authoritative set: `ParsedSeedPacket` + `20260624000500_nursery.sql` — the existing paste flow already carries **every user-settable column**, so the CSV mostly formalises it.

| CSV header | Required | Type / validation | Maps to |
|---|---|---|---|
| `plant_name` | **yes** | text ≤120 | tries a case-insensitive match against the home's Shed plants → `plant_id`; otherwise `plant_id = null` and the name is preserved in the `notes` provenance line (existing convention in `BulkPasteSeedPacketsModal.buildNotes`) |
| `variety` | no | text ≤120 | `variety` |
| `vendor` | no | text ≤120 | `vendor` |
| `purchased_on` | no | date | `purchased_on` |
| `opened_on` | no | date | `opened_on` |
| `sow_by` | no | date (year/month tolerated → end-of-period) | `sow_by` |
| `quantity_remaining` | no | text ≤80 (free-form by design: "~30 seeds", "half packet") | `quantity_remaining` |
| `notes` | no | text ≤400 | `notes` (+ provenance line) |

The **link-by-name** behaviour is a small improvement over the current paste flow (which always inserts `plant_id = null`); it makes Plant Out possible straight after import when the Shed plant already exists. Exact-name match only, no fuzzy — ambiguity falls back to unlinked.

## 6. Upload flow per surface

All three surfaces share one pipeline: **choose mode → parse → validate → per-row review with error report → idempotent-ish insert → summary toast**.

### Shared UI

- New shared component `src/components/CsvUploadStep.tsx`: file input (`accept=".csv,.tsv,text/csv"`, also a paste-into-textarea fallback for mobile where file pickers are awkward), a **Download template** button (`data-testid="csv-template-download"`), and the parse trigger. Reads the file client-side (`File.text()`), never uploads the raw file anywhere.
- **Per-row error report**: `parseCsv` returns `issues: RowIssue[]` (`{ rowNumber, field, severity: 'error'|'warning', message }`). The review step renders valid rows as the existing editable candidate cards; rows with errors render with a red banner listing the exact problems and are excluded from Save until fixed inline or removed. Warnings (unknown column, clamped value, unmatched plant name) don't block.
- Row caps: reuse the existing 60-candidate cap (plants + packets); Watchlist gets the same 60. Hard input cap 200 rows / ~100 KB with a friendly "split the file" error (mirrors `MAX_INPUT_CHARS` on the AI path).

### 6.1 The Shed — plants

- `BulkPastePlantsModal` gains the Paste / Upload CSV mode toggle. CSV mode → `parseCsv(text, PLANT_TEMPLATE)` → review step (existing candidate cards, extended to surface the new fields in a compact "N extra fields" expander per row rather than 25 inputs per card) → per-row `saveToShed` with the full payload (unchanged loop semantics: serial, partial success, failure list in the toast).
- Entry point unchanged (Shed header "Bulk paste" — rename the button to **"Bulk add"** since it now covers upload too). Gated by `shed.add` as today.

### 6.2 Watchlist — ailments (new bulk surface)

- New `src/components/BulkAddAilmentsModal.tsx`, structurally cloned from `BulkPastePlantsModal` (two-step, portal, focus trap, `data-testid`s). Opened from a new **"Bulk add"** button in the Watchlist header next to Add Ailment, gated by `ailments.add`.
- CSV mode → `AILMENT_TEMPLATE`. Free-text paste mode → new `src/lib/parseAilmentList.ts` (regex fallback: `name [- type] [- notes]` per line, defaulting `type` from a picker in the modal) + new edge fn `parse-ailment-list` for Sage+ (clone of `parse-plant-list` with an ailment schema). *(If the approver prefers, the AI paste half can be deferred — CSV-only still satisfies the ticket; see §12 Q3.)*
- Save loop: serial `supabase.from('ailments').insert(...)` per row (`source:'manual'`), same partial-success toast pattern.
- Duplicate guard: before insert, warn (not block) when an active ailment with the same lowercased `name` already exists in the home — addresses the documented "Aphid vs Aphids" pitfall.

### 6.3 Nursery — seed packets

- `BulkPasteSeedPacketsModal` gains the same mode toggle. CSV mode → `SEED_PACKET_TEMPLATE` → existing review rows (already editable per field) → existing serial `createSeedPacket` loop, plus the new link-by-name resolution before insert.

### Idempotency / duplicates policy

True idempotent upsert isn't possible (no natural key: users legitimately own two "Tomato" rows). Policy: **warn-on-duplicate at review time** (case-insensitive name match against existing home rows — plants, ailments, packets by name+variety), with the row's card showing a "Already in your Shed/Watchlist/Nursery" chip and defaulting to **deselected**; user can tick it back on. Inserts remain serial with partial success so a mid-batch failure never half-writes a row.

## 7. Template generation + download

- `buildTemplateCsv(template)` emits: BOM + header row + one `EXAMPLE — delete this row` example row populated from each `FieldSpec.example`.
- `downloadTemplate(template)` creates a Blob (`text/csv;charset=utf-8`) + anchor download: `rhozly-plants-template.csv`, `rhozly-watchlist-template.csv`, `rhozly-seed-packets-template.csv`.
- A **Download template** button appears in the CSV mode of all three modals, plus the modal shows a compact field-reference table (generated from the same registry: header / required / allowed values) so the format is documented in-product, not just in the file.
- No `public/` assets, no server involvement — templates can never drift from the parser because both are the registry.

## 8. Limits & tier considerations

- **CSV path: no tier gate.** Manual creation is available on every tier (per `25-plant-providers.md`), and the CSV path is exactly bulk-manual-creation. It costs no AI. Permissions still apply (`shed.add`, `ailments.add`).
- **AI paste path: unchanged gating** (`ai_enabled` → edge fn; else regex).
- Row cap 60 per import (existing convention); input size cap ~100 KB; per-cell length caps per the matrices.
- No rate-limit concerns (pure client parse + normal RLS-checked inserts).

## 9. File-by-file change list

**New — `src/lib/uploadTemplates/`** (all pure, unit-testable): `types.ts`, `csv.ts`, `registry.ts`, `parse.ts`, `template.ts`.

**New components:** `src/components/CsvUploadStep.tsx` (shared mode UI), `src/components/BulkAddAilmentsModal.tsx`.

**New lib + edge fn (Phase 2, optional per §12 Q3):** `src/lib/parseAilmentList.ts`; `supabase/functions/parse-ailment-list/index.ts`.

**Modified:**
- `src/components/BulkPastePlantsModal.tsx` — mode toggle, CSV step, extended review card (extra-fields expander), pass full payload to `saveToShed`.
- `src/components/nursery/BulkPasteSeedPacketsModal.tsx` — mode toggle, CSV step, link-by-name resolution.
- `src/components/TheShed.tsx` — button label "Bulk add" (line ~2317 usage unchanged otherwise).
- `src/components/AilmentWatchlist.tsx` — "Bulk add" header button (perm-gated `ailments.add`) opening the new modal; export/reuse of `AilmentSymptom`/`AilmentStep` types + `newStep`/`newSymptom` helpers (move to a small `src/lib/ailmentTypes.ts` if the import cycle is awkward).
- `src/events/registry.ts` — new events: `BULK_AILMENT_IMPORT_COMPLETED`, extend `BULK_PLANT_IMPORT_COMPLETED` / packet equivalent with `mode: 'csv' | 'paste'`.

**Migrations:** **none.** All target columns exist; `source='manual'` is valid on both check constraints; no new tables (so no Data-API-grant work).

## 10. Phasing

- **Phase 1 — registry + plants CSV** (core value): `uploadTemplates/` module + tests, plants template download, CSV mode in `BulkPastePlantsModal`, review-step error report.
- **Phase 2 — Watchlist bulk add**: `BulkAddAilmentsModal` with CSV mode (+ AI/regex paste if approved), ailment template, duplicate warning.
- **Phase 3 — seed packets CSV**: mode toggle in `BulkPasteSeedPacketsModal`, packet template, link-by-name.
- **Phase 4 — docs + polish**: app-reference/test-plan updates (can land with each phase), release-notes entry.

Each phase is independently shippable; Phase 1 alone already delivers asks 2+3 for the highest-traffic surface.

## 11. Risks, edge cases, alternatives considered

- **CSV formula injection**: we don't currently *export* user data, but templates + future exports must prefix cells beginning `= + - @ \t` with `'` if we ever emit user-entered values. For v1 the only emitted file is the static template (safe); the parser additionally **strips a leading `'`** and rejects cells starting with `=` in text fields with a warning, so a re-exported file elsewhere can't smuggle formulas back in.
- **Encoding**: BOM on download; on upload, decode as UTF-8 and tolerate a leading BOM; Windows-1252 smart quotes normalised in the tokenizer (they already appear in the paste parsers' quote classes).
- **Delimiter locales**: header-row sniffing (§3). Ambiguous header row (no recognised headers under any delimiter) → single clear error: "First row must be the header row from the template."
- **Duplicates**: warn + default-deselect (§6); never silent-skip, never hard-block.
- **Large numbers of enum typos**: per-field errors keep the rest of the row usable; enum normalisation is case-insensitive.
- **Nested ailment data fidelity** (severity-only symptoms, title-only steps): accepted v1 trade-off, refine in detail UI; alternative (numbered column groups) rejected as template-hostile.
- **Species vs instance confusion**: plants CSV creates species rows only, `quantity` is informational — mirrored from the existing paste flow; template example row + field-reference table say so explicitly.
- **Alternatives considered**: static templates in `public/` (rejected — drift); XLSX via a library (rejected — dependency weight, CSV covers the need, Excel opens CSV fine with BOM); JSON upload (rejected — not spreadsheet-friendly for the target user); server-side CSV parsing edge fn (rejected — pure client parse is free, offline-friendly, and the data is small).

## 12. Open questions (need answers before/at approval)

1. **Image URLs in plant CSV** — allow an optional `image_url` column (proxied through `image-proxy` at import) or keep images UI-only? Plan assumes **excluded** for v1.
2. **Ailment nested-cell grammar** — is `title [severity]` for symptoms and title-only steps acceptable for v1, with full step config done in the detail editor afterwards?
3. **Watchlist AI free-text paste** — build `parse-ailment-list` (new edge fn) in Phase 2, or ship Watchlist CSV-only first? Plan assumes build it, but it's cleanly severable.
4. **Button naming** — "Bulk add" for all three entry points OK?
5. **Row cap** — is 60 rows per import acceptable for real user lists, or should CSV allow more (e.g. 200) given it skips the AI token limits?

## 13. Tests (mandatory per CLAUDE.md)

**Vitest unit (`tests/unit/lib/uploadTemplates/`):**
- `csv.test.ts` — tokenizer: quoting, embedded commas/newlines/quotes, BOM, CRLF, delimiter sniffing (`,` `;` tab), smart quotes, formula-prefix stripping.
- `registry.test.ts` — **parity tests**: PLANT_TEMPLATE headers ⊇ ManualPlantCreation `cleanPayload` keys (pinned list); AILMENT_TEMPLATE ↔ `ailments` insert shape; SEED_PACKET_TEMPLATE ↔ `ParsedSeedPacket`. These are the anti-drift guards.
- `parse.test.ts` — per-field validation, cross-field (watering min≤max), enum normalisation, multi-value cells, per-row error report shape, row cap, EXAMPLE-row skip.
- `template.test.ts` — round-trip: `parseCsv(buildTemplateCsv(t), t)` yields the example row with zero errors, for all three templates.

**Deno (`supabase/tests/`)** — only if `parse-ailment-list` ships: schema-normalisation test mirroring the existing parse-fn tests.

**Playwright E2E (`tests/e2e/specs/`)** — reference RHO-4 in test names:
- Shed: open Bulk add → CSV mode → download template (assert filename + header row) → upload a small CSV (valid + one bad row) → error shown on bad row → save valid rows → plants appear in grid.
- Watchlist: bulk add via CSV → ailments appear with Manual badge; duplicate-name warning case.
- Nursery: CSV upload → packet listed; linked-by-name case shows the linked plant.
- Page objects updated for the new buttons/testids (`bulk-add-mode-csv`, `csv-template-download`, `csv-file-input`, `bulk-add-ailments-modal`, …).

## 14. Documentation to update

**App-reference:**
- `03-garden-hub/01-the-shed.md` — bulk modal's new CSV mode + template download + renamed button.
- `03-garden-hub/02-watchlist.md` — new Bulk add flow (both roles: Role 1 component graph + write path, Role 2 flows/pitfalls incl. duplicates).
- `03-garden-hub/10-nursery.md` — packet CSV mode + link-by-name.
- `99-cross-cutting/03-data-model-plants.md` / `06-data-model-ailments.md` — note the CSV import write path.
- If `parse-ailment-list` ships: `99-cross-cutting/10-edge-functions-catalogue.md` + `13-ai-gemini.md`.
- New surface file for `BulkAddAilmentsModal` under `08-modals-and-overlays/` (via `_template.md`) + `00-INDEX.md` row.

**Test plan:** rows in `docs/e2e-test-plan/` for Shed / Watchlist / Nursery surfaces; `TESTING.md` inventory + counts for the new spec + page objects.

**Release notes:** entry in `release-notes.json` when deployed (sections-array format).

---

## Revision 2026-07-03 — favourites integration (post cross-home-favourites)

The cross-home favourites feature (plants/ailments/packets) shipped after this plan was written. RHO-4 now integrates with it.

**Uploaded plants are ALL created as `source='manual'`** (user decision 2026-07-03). Rationale: uploaded rows are the user's own data — manual keeps them editable (non-manual plants are now copy-on-write locked), off the tier gates, own unique ids, and needs no dedup/scientific-name matching (explicitly rejected for favourites too). NO lookup against library/API/AI catalogue rows. Ailments uploaded the same way (`source='manual'`); seed packets have no source (always user-created).

**"Add uploaded rows to Favourites" — no new DB column.** Favourites live in `user_favourite_plants` / `_ailments` / `_seed_packets` (their own tables). Mechanism:
- A `favourite` boolean FieldSpec (kind `bool`, default false) is added to each RecordTemplate → appears as an optional column in the downloadable CSV template, so a user can mark specific rows in their spreadsheet.
- The review step gets a **"Mark all as favourites"** convenience toggle (sets every row's favourite flag) and a per-row favourite checkbox.
- On import: after the manual insert succeeds for a row, if its favourite flag is set, call the existing `favouritePlant()` / `favouriteAilment()` / `favouriteSeedPacket()` service fn for that new row. Since the row is `manual`, the server tier-trigger always allows it — no gating, no AI/API spend.
- The AI free-text paste path (unchanged parser) also reaches the same review step, so the favourite toggle works identically there.

This adds one FieldSpec per template + a review-step toggle + a post-insert favourite call — no schema change, no migration.

## Answers to open questions 2026-07-03

1. **Favourites UX**: `favourite` boolean CSV column + "Mark all as favourites" review-step toggle (per-row control). Confirmed above.
2. **Ailment nested grammar**: simple v1 — symptoms as `title [severity]`, step titles only; full step config in the detail editor afterwards. Approved.
3. **Watchlist AI free-text paste**: BUILD it — new `parse-ailment-list` Gemini edge function so the Watchlist gets the same "paste a list" mode as plants/packets (Sage+ AI with regex fallback, mirroring parse-plant-list). In Phase 2.
4. **Row cap**: 200 rows per CSV import (AI-paste path keeps its ~60 token-bound limit).
5. **Image URLs** (Q1 in §12): excluded v1 (plan default) — images stay a per-record UI action.
6. **Button naming** (Q4 in §12): "Bulk add" across all three entry points (plan default).

Ready to implement. Phases: (1) registry + plants CSV + favourites column, (2) Watchlist bulk add — CSV + AI paste (parse-ailment-list) + favourites, (3) seed packets CSV + favourites, (4) docs/polish folded into each.
