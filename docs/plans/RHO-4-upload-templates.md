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

---

## Phase 1 — IMPLEMENTED (2026-07-03)

Delivered the registry module + plants CSV upload + favourites-on-import, exactly to §4 / §5.1 / §10 + the appendices. **Phases 2/3 (Watchlist, seed packets) NOT built** — but the registry is structured so they slot in by adding a `RecordTemplate` to `TEMPLATES` (no changes to `csv.ts` / `parse.ts` / `template.ts`).

### Files added
- **`src/lib/uploadTemplates/`** (pure, no React):
  - `types.ts` — `FieldSpec`, `RecordTemplate`, `RowIssue`, `ParsedRow`, `ParseResult`. Added `extractFavourite` on `RecordTemplate` + a `favourite: boolean` on `ParsedRow` so the review step gets the flag without it leaking onto the insert payload.
  - `csv.ts` — RFC-4180 tokenizer + serialiser; BOM strip on input / BOM prepend on output; delimiter sniffing on the header row (`,` / `;` / tab); smart-quote normalisation; CRLF/LF.
  - `registry.ts` — `PLANT_TEMPLATE` only (Phase 1). `buildPayload` folds variety/quantity/notes into `plant_metadata` + derives labels, returns a `source='manual'` `saveToShed` skeleton. Exposes `PLANT_TEMPLATE_PLANT_COLUMNS` for the parity test.
  - `parse.ts` — `parseCsv<T>(text, template) → { rows, issues }` with per-row + per-field errors, EXAMPLE-row skip, **200-row cap**, enum normalisation, cross-field validation, formula-prefix hardening.
  - `template.ts` — `buildTemplateCsv` (BOM + headers + EXAMPLE row) + `downloadTemplate`.
  - `index.ts` — public barrel.
- **`tests/unit/lib/uploadTemplates/`** — `csv.test.ts` (17), `registry.test.ts` (8, incl. the cleanPayload parity guard), `parse.test.ts` (31), `template.test.ts` (4) = **60 tests, all green**.

### Files changed
- `src/components/BulkPastePlantsModal.tsx` — mode toggle ("Paste a list" / "Upload CSV"), file input + template download in CSV mode, shared review step with per-row/field error display, per-row favourite checkbox + "Mark all as favourites", favourites-on-import via `favouritePlant()`. Header renamed to "Bulk add plants".
- `src/components/TheShed.tsx` — bulk button label "Bulk paste" → **"Bulk add"**.
- `tests/e2e/pages/ShedPage.ts` + `tests/e2e/specs/shed-crud.spec.ts` — new `SHED-BULK-001..005` (mode toggle, template download, review + bad-row exclusion, import creates manual plants + favourite in Favourites scope, free-text paste still reaches the shared review step).
- Docs: `03-garden-hub/01-the-shed.md` (both roles + code refs), `99-cross-cutting/03-data-model-plants.md` (CSV write-path note), `docs/e2e-test-plan/06-shed.md` (SHED-BULK rows), `TESTING.md` (unit count 1187→1247, new suite row).

### Deviations from the plan
1. **`labels` defaults to `[]`, not `null`.** The `plants.labels` column is `NOT NULL`; the plan's §5.1 implied a nullable label list. Both the CSV `buildPayload` and the free-text candidate path now default to `[]` (matching `ManualPlantCreation.cleanPayload`, which sends `labels: []`). Caught by SHED-BULK-004 (a `23502` not-null violation) and fixed. **The pre-existing free-text paste path had the same latent bug** (`labels: variety ? [...] : null`) and was fixed in the same change.
2. **Shared `CsvUploadStep.tsx` component NOT extracted.** §6 proposed a shared component for reuse across the three surfaces. Since Phase 1 only touches the Shed, the CSV UI lives inline in `BulkPastePlantsModal`. Phase 2/3 can extract it then, when there's a second/third caller to share it with (avoids a one-off abstraction — CLAUDE.md "no speculative changes").
3. **Date parsing is ISO-only in `parse.ts`.** `date` kind accepts `YYYY-MM-DD` only; the seed-packet flexible dates (`YYYY-MM`, `Month YYYY`) land with Phase 3's `SEED_PACKET_TEMPLATE`. No plant field is a date, so this is a no-op for Phase 1.
4. **Row cap is 200 (per answer 4), not the 60 the AI paste path uses.** CSV skips AI token limits.
5. **Favourite plumbing:** rather than putting `favourite` on the insert payload (which would try to insert a non-existent column), it's surfaced on `ParsedRow.favourite` via `RecordTemplate.extractFavourite`, read by the modal to call `favouritePlant(newRow, homeId)` after each successful insert.

### Gates (all green)
- `npm run typecheck` → 0 errors.
- `node scripts/check-schema-columns.mjs --local` → 0 findings (134 tables).
- `npm run test:unit` → 1247 passed (111 files).
- `npm run test:functions` → 757 passed.
- `npm run build` → success.
- `npx playwright test shed-crud.spec.ts -g "RHO-4 CSV upload"` → 5 passed.

### Phase 2/3 handoff
- **Ailments (Phase 2):** add `AILMENT_TEMPLATE` to `registry.ts` (fields per §5.2 + a `favourite` bool) and register it in `TEMPLATES`. Its `buildPayload` maps to the `ailments` insert shape (symptoms/steps jsonb per the `title [severity]` grammar) and `extractFavourite` reads the flag; the review step calls `favouriteAilment()`. New `BulkAddAilmentsModal` clones the Shed modal's two-mode structure; add `parse-ailment-list` for the AI paste half. `csv.ts` / `parse.ts` / `template.ts` need **no changes**.
- **Seed packets (Phase 3):** add `SEED_PACKET_TEMPLATE` (§5.3) + register it; add flexible-date support to `parse.ts`'s `date` kind (accept `YYYY-MM` / `Month YYYY` → end-of-period, reusing `parseDatePhrase`). `buildPayload` maps to `createSeedPacket`; `extractFavourite` → `favouriteSeedPacket()`. Add the mode toggle to `BulkPasteSeedPacketsModal` + link-by-name resolution.
- **Shared UI:** extract `CsvUploadStep.tsx` when wiring the second caller.

---

## Phase 2 — IMPLEMENTED (2026-07-03)

Delivered the Watchlist bulk add — **CSV upload AND the AI free-text paste** — exactly to §5.2 / §6.2 + the answers appendix (simple grammar v1, build `parse-ailment-list`, `source='manual'`, favourites-on-upload, 200-row cap). Extended Phase 1's registry (no rebuild): `AILMENT_TEMPLATE` slots into `TEMPLATES`; `csv.ts` / `template.ts` unchanged; `parse.ts` gained two new field kinds (`symptoms`, `steps`) shared by any future template.

### Files added
- **`src/lib/uploadTemplates/registry.ts`** — `AILMENT_TEMPLATE` (fields per §5.2 + a `favourite` bool). `buildPayload` → the `ailments` insert shape (`source='manual'`, jsonb symptom/step arrays, `description` defaults `''` for the NOT-NULL col, `home_id` injected by the modal not the template). `extractFavourite` reads the flag. Exposes `AILMENT_TEMPLATE_COLUMNS` for the parity test.
- **`src/lib/uploadTemplates/types.ts` + `parse.ts`** — new `symptoms` (`title [severity]` → `AilmentSymptom{id,title,severity,description:"",location:""}`) and `steps` (title-only → full `AilmentStep` with StepBuilder defaults + 1-based `step_order`) field kinds. `ParsedValue` widened to allow object arrays. These are reusable, not ailment-specific.
- **`src/components/BulkAddAilmentsModal.tsx`** — cloned from `BulkPastePlantsModal`: mode toggle ("Paste a list" AI/regex → `parseAilmentList`; "Upload CSV" → `AILMENT_TEMPLATE`), shared review step with editable **name + type** per row, per-row/per-field error banners, per-row favourite checkbox + "Mark all as favourites", template download, serial `ailments` insert (`source='manual'`) + post-insert `favouriteAilment()` for flagged rows. Event `BULK_AILMENT_IMPORT_COMPLETED`.
- **`src/lib/parseAilmentList.ts`** — client caller mirroring `parsePlantList`: Sage+ → `parse-ailment-list` edge fn; else `parseAilmentListLocal` regex (name + dash/colon/paren detail → symptom titles) with keyword `classifyAilmentType` (pest/disease/invasive_plant). AI failure falls back to regex.
- **`supabase/functions/parse-ailment-list/index.ts`** — mirrors `parse-plant-list` but **USER-scoped**: `requireAuth` + `guardAiByUser` + `enforceRateLimit` (no homeId needed for pure extraction). Returns `{ ailments }`.
- **`supabase/functions/_shared/ailmentListParse.ts`** — pure prompt + `AILMENT_PARSE_SCHEMA` + `normaliseAilments` / `normaliseAilmentType` (Deno-tested, factored out like the seed-prompt helpers so the edge fn shape is verifiable without the DB).
- **Tests:** `tests/unit/lib/uploadTemplates/registry.test.ts` (+8 ailment parity / `title [severity]` / step-defaults / favourite tests = 68 in the suite), `tests/unit/lib/parseAilmentList.test.ts` (11), `supabase/tests/parseAilmentList.test.ts` (9 Deno). E2E: `tests/e2e/specs/watchlist.spec.ts` WL-BULK-001..005 + `WatchlistPage.ts` locators/helpers.

### Files changed
- `src/components/AilmentWatchlist.tsx` — "Bulk add" header button (perm-gated `ailments.add`, Home scope) + `showBulkAdd` state + modal render (prepends created rows, refreshes favourites).
- `src/events/registry.ts` — `BULK_AILMENT_IMPORT_COMPLETED`.
- Docs: `03-garden-hub/02-watchlist.md` (both roles + code refs + edge-fn row), `99-cross-cutting/06-data-model-ailments.md` (CSV write-path note + code refs), `10-edge-functions-catalogue.md` (`parse-ailment-list`), `docs/e2e-test-plan/11-watchlist.md` (WL-BULK rows), `TESTING.md` (counts 1247→1267 unit / 757→766 Deno / 521→526 E2E + suite rows).

### Deviations from the plan
1. **Auth by user, not home.** The plan/§6.2 implied cloning `parse-plant-list` (which uses `requireHomeMembership` + `guardAiByHome` on a `homeId`). The prompt specified `guardAiByUser`, and the pure extraction needs no homeId — so `parse-ailment-list` takes `{ text }` only and gates on the token's user. Simpler; the insert (which IS home-scoped) still happens client-side via RLS-checked `ailments.insert`.
2. **`config.toml` unchanged.** The other parse fns aren't listed in `supabase/config.toml`, so `parse-ailment-list` isn't added there either (matches the handoff's conditional "if the others are listed there").
3. **Shared `CsvUploadStep.tsx` NOT extracted.** The Phase 1 handoff said to extract shared CSV/review components "when Phase 2/3 add a second caller." On inspection the CSV/review UI is tightly interwoven with per-record specifics (plant name+variety+extras vs ailment name+type+symptom/step summaries; different favourite services; different insert paths). A generic extraction would need heavy prop/callback plumbing for two callers and would obscure both. Per CLAUDE.md "no speculative changes," the modal is a focused clone of `BulkPastePlantsModal` sharing the real DRY win — the `uploadTemplates/` registry + parser + `csv.ts`/`template.ts` (100% shared). Re-evaluate at Phase 3 (a third caller) whether a shared step component then pays for itself.
4. **New reusable field kinds.** `symptoms`/`steps` were added to the generic `parse.ts` (not a one-off in the registry) so Phase 3 / future templates can reuse the nested-object cell grammar.

### Gates (all green)
- `npm run typecheck` → 0 errors.
- `node scripts/check-schema-columns.mjs --local` → 0 findings (134 tables). (Local anon key = `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env` / `supabase status`.)
- `npm run test:unit` → 1267 passed (112 files).
- `npm run test:functions` → 766 passed.
- `npm run build` → success.
- `npx playwright test watchlist.spec.ts` → WL-BULK-001..005 pass; full spec 21 passed + 1 pre-existing flaky (WL-022 search, unrelated — passed on retry).

### Phase 3 handoff (seed packets — NOT built here)
- Add `SEED_PACKET_TEMPLATE` (§5.3) to `registry.ts` + register in `TEMPLATES`; add flexible-date support to `parse.ts`'s `date` kind (`YYYY-MM` / `Month YYYY` → end-of-period via `parseDatePhrase`). `buildPayload` → `createSeedPacket`; `extractFavourite` → `favouriteSeedPacket()`. Add the mode toggle to `BulkPasteSeedPacketsModal` + link-by-name resolution.
- With a **third** CSV/review caller landing, that's the point to reconsider extracting a shared `CsvUploadStep` / `ReviewStep` (see deviation 3). `csv.ts` / `template.ts` / the two new field kinds still need no changes.

---

## Phase 3 — IMPLEMENTED (2026-07-03) — FINAL

Delivered the Nursery seed-packet CSV upload — mode toggle on the existing paste modal, `SEED_PACKET_TEMPLATE`, flexible dates, link-by-name, favourites-on-import — exactly to §5.3 / §6.3 / §10 + the appendices (200-row cap, favourite column + review toggle, packets ungated). Extended Phase 1/2's registry (no rebuild): `SEED_PACKET_TEMPLATE` slots into `TEMPLATES`; `csv.ts` / `template.ts` unchanged; `parse.ts` gained shared flexible-date support (a generic `date`-kind enhancement, not packet-specific). **RHO-4 is now feature-complete across all three surfaces (Shed plants, Watchlist ailments, Nursery packets) and ready for combined validation.**

### Flexible-date approach (shared infra, kept generic)
- New `parseFlexibleDate(raw, round: "up" | "down")` in `parse.ts` — a template-agnostic helper mirroring `parseSeedPackets.parseDatePhrase`: full `YYYY-MM-DD` used verbatim; `YYYY-MM` / `Month YYYY` / `YYYY Month` resolved by direction (down → first of period, up → last); bare year accepted only when rounding up (a deadline). Range-guarded (1980–2100), leap-year aware.
- A **`FieldSpec.datePartial: "up" | "down"`** prop (default `"down"`) is how any template opts a `date` field into round-up vs round-down. `SEED_PACKET_TEMPLATE`'s `purchased_on` / `opened_on` use `"down"`; `sow_by` uses `"up"`. The `date` case in `coerceField` reads the prop → calls `parseFlexibleDate`. No plant/ailment field is a date, so this is inert for their templates.

### Shared review-step component — NOT extracted (justification)
The Phase 2 handoff flagged the **third** caller as the point to reconsider a shared `CsvReviewStep`. Evaluated and **declined** — the three review steps are NOT substantially duplicated in a way a clean extraction would resolve:
- The per-row body differs materially per record: plants (name + variety + a 25-field expander), ailments (name + editable **type select** + symptom/step summary expander), packets (a 6-field grid: plant / variety / vendor / qty / sow-by / opened + the notes provenance line). The editable cells, the "extra fields" affordance, and the per-record patch semantics are all different.
- Each calls a different favourite service (`favouritePlant` / `favouriteAilment` / `favouriteSeedPacket`) and a different insert path (`saveToShed` / `ailments.insert` / `createSeedPacket`), with per-record post-insert logic (link-by-name only for packets).
- A generic component would need heavy render-prop / callback plumbing (row renderer, favourite fn, insert fn, id shape) for exactly three callers and would obscure all three. The **real** DRY win is already fully shared: `uploadTemplates/` registry + `parseCsv` + `csv.ts` + `template.ts` + the `date`/`symptoms`/`steps` field kinds — 100% common across all three. The mode-toggle + file-input + template-download + "mark all favourites" + file-issues + per-row error banner **patterns** are mirrored (structurally identical) without a forced abstraction, per CLAUDE.md "no speculative changes." This matches the Phase 1 (deviation 2) and Phase 2 (deviation 3) calls.

### Link-by-name reuse
Uses the **exact** existing unlinked-packet convention — no new linking scheme. On Save, `BulkPasteSeedPacketsModal` (for BOTH paste and CSV modes) fetches the home's non-archived `plants` once, builds a case-insensitive `common_name → id` map, and resolves each row: match → `plant_id` set; no match → `plant_id = null` + the name preserved in the existing `buildNotes` provenance line (`Bulk import — plant: "X".`). This mirrors `favouritesService.addFavouritePacketToHome`'s own name-resolution and the packet-detail unlinked convention. Consequence: link-by-name now also applies to the **paste** path (previously always `plant_id = null`) — a strict improvement; the pre-existing NURSERY-031 assertion was updated to reflect Tomato/Basil auto-linking against seeded plants.

### Files added
- Tests: `tests/unit/lib/uploadTemplates/parse.test.ts` (+10: `parseFlexibleDate` round up/down/verbatim/bare-year/garbage + the `date` FieldSpec through the parser on SEED_PACKET_TEMPLATE); `registry.test.ts` (+7: SEED_PACKET_TEMPLATE ↔ createSeedPacket parity, `plant_name` required + non-column, modal-owned keys stripped, datePartial directions, favourite bool). E2E: `nursery-lifecycle.spec.ts` NURSERY-034..037 + `NurseryPage.ts` locators/helpers.

### Files changed
- `src/lib/uploadTemplates/types.ts` — `FieldSpec.datePartial` prop.
- `src/lib/uploadTemplates/parse.ts` — `parseFlexibleDate` + flexible `date` case (was ISO-only).
- `src/lib/uploadTemplates/registry.ts` — `SEED_PACKET_TEMPLATE` + `SEED_PACKET_TEMPLATE_COLUMNS` + registered in `TEMPLATES`.
- `src/lib/uploadTemplates/index.ts` — export `SEED_PACKET_TEMPLATE`, `SEED_PACKET_TEMPLATE_COLUMNS`, `parseFlexibleDate`.
- `src/components/nursery/BulkPasteSeedPacketsModal.tsx` — mode toggle (paste / CSV), template download + file input, shared review step with per-row/file error banners, per-row favourite + "Mark all", link-by-name resolution on save, favourites-on-import, `EVENT.BULK_PACKET_IMPORT_COMPLETED`.
- `src/events/registry.ts` — `BULK_PACKET_IMPORT_COMPLETED`.
- `tests/e2e/specs/nursery-lifecycle.spec.ts` — NURSERY-031 assertion updated for link-by-name; NURSERY-034..037 added.
- Docs: `03-garden-hub/10-nursery.md` (both roles + component graph + code refs), `99-cross-cutting/33-data-model-nursery.md` (link-by-name write-path + code refs), `docs/e2e-test-plan/24-nursery.md` (NURSERY-034..037 rows + testids/page-object note), `TESTING.md` (unit 1267→1283, E2E 526→530, uploadTemplates suite 68→85, nursery spec 22→26).

### Deviations from the plan
1. **`datePartial` prop instead of hardcoding per-field.** The plan said "a FieldSpec can opt into 'partial date rounds up vs down' via a prop" — implemented exactly as `FieldSpec.datePartial`. `parseFlexibleDate` is exported so it's independently unit-tested.
2. **Link-by-name now also applies to the paste path.** The plan scoped link-by-name to the CSV path, but both paths feed the same save loop, so it applies uniformly (a strict improvement — paste rows can now auto-link too). NURSERY-031 updated accordingly.
3. **Shared review-step component not extracted** (see justification above).
4. **No migration** — all target columns exist; CSV import is bulk `createSeedPacket`.

### Gates (all green)
- `npm run typecheck` → 0 errors.
- `node scripts/check-schema-columns.mjs --local` → 0 findings (134 tables). (Local anon key = `VITE_SUPABASE_PUBLISHABLE_KEY` / `supabase status` Publishable; export it as `VITE_SUPABASE_ANON_KEY` so the script's `--local` branch reads it — a bare run 401s.)
- `npm run test:unit` → 1283 passed (112 files).
- `npm run test:functions` → 766 passed (no edge-fn change in Phase 3).
- `npm run build` → success.
- `npm run test:seed` → all 4 workers seeded.
- `npx playwright test nursery-lifecycle.spec.ts` → 26 passed (RHO-4 NURSERY-034..037 + the pre-existing 22, incl. the updated NURSERY-031).

### Feature status — READY FOR COMBINED VALIDATION
All three CSV surfaces are consistent: one shared `uploadTemplates/` registry (`PLANT_TEMPLATE` / `AILMENT_TEMPLATE` / `SEED_PACKET_TEMPLATE` in `TEMPLATES`); the same 200-row cap; the same `favourite` bool column + "Mark all as favourites" review toggle + post-insert favourite call (`favouritePlant` / `favouriteAilment` / `favouriteSeedPacket`); the same per-row/file-level error model, template download, and mode toggle. RHO-4 (all four phases) is complete.
