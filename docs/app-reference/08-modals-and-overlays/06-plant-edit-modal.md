# Plant Edit Modal

> The full plant detail / edit modal opened from the Shed grid. Multi-tab: Care details, Schedule, Guides, Light, Companions. Manual edit of plant-level metadata; per-instance edits live in InstanceEditModal.

**Source file:** `src/components/PlantEditModal.tsx`

---

## Quick Summary

Opens when you tap a plant card in the Shed. Edits go to the `plants` row (plant-level — shared across all instances of the species in this home). Per-instance tweaks (state, area, notes) happen in InstanceEditModal.

Tabs:
- **Care** — common name, scientific names, sun/water/soil, cycle, hardiness
- **Schedule** — `PlantScheduleTab` shows blueprints + ghost tasks for this species
- **Guides** — `PlantGuidesTab` shows AI care guides + linked guides
- **Light** — `LightTab` shows lux history for areas hosting this plant
- **Companions** — `CompanionPlantsTab` shows companion / antagonist data

---

## Role 1 — Technical Reference

### Component graph

```
PlantEditModal (Portal, focus-trapped)
├── Header (close, title, "View instances" button)
├── At-a-glance row (instance count, areas, latest lux, open tasks)
├── Tab bar
│   ├── Care
│   ├── Schedule → PlantScheduleTab
│   ├── Guides → PlantGuidesTab
│   ├── Light → LightTab
│   └── Companions → CompanionPlantsTab
├── Active tab body
├── Provider info chip (Perenual / Verdantly / AI / Manual)
├── Refresh from provider (re-fetch care details)
└── Save / Cancel
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope |
| `plant` | `any` | parent | The `plants` row |
| `onSave` | `(updated) => void` | parent | Save callback |
| `onClose` | `() => void` | parent | Hide |
| `isSaving` | `boolean?` | parent | Save in flight |
| `aiEnabled` | `boolean?` | parent | Gate AI re-fetch |
| `isPremium` | `boolean?` | parent | Perenual gate |

### Data flow — read paths

- On mount, if `plant.source !== "manual"`, optionally re-fetches latest provider details via `getProviderPlantDetails`.
- At-a-glance data via queries against `inventory_items`, `area_lux_readings`, `tasks`.

### Data flow — write paths

- `onSave` is the canonical write — parent does the actual `plants.update(...)`.

### Edge functions invoked

- `manual-refresh-ai-plant` — Wave 5 "Refresh now" button on the Care tab (Sage+ only). Re-asks Gemini for the global AI plant's care guide, diffs vs current, bumps `freshness_version` if anything changed. Rate-limited at the edge (1 per (user, plant) per 7 days) + client-side fast-path cache in `localStorage[`rhozly_ai_refresh_${plant_id}`]`.

Sub-tabs may invoke their own (e.g. AI care guide fetch from Guides tab).

### Realtime channels

None.

### Tier gating

- Refresh from provider gated by Premium / AI flag.

### Beta gating

None.

### Permissions

- `shed.edit` to save.

### Error states

| State | Result |
|-------|--------|
| Provider re-fetch fails | Toast; existing data preserved |
| Save fails | Toast |

### Performance

- Focus-trapped portal.
- Sub-tabs lazy on switch.

### Linked storage buckets

- Plant photos referenced by URL; not edited here.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

When you want to edit the plant *species* — care notes, sun/water defaults, hardiness — this is the place. Edits apply to every instance of this plant in your home (the species record is shared).

For per-bed tweaks ("this tomato is in a shadier spot"), use Instance Edit Modal instead.

### Every flow on this modal

#### 1. Care tab

- Edit common name, scientific names, sun/water/soil, cycle, hardiness range.
- **AI freshness callout (Wave 5)** — appears at the top of this tab when the plant is an AI catalogue entry whose version is ahead of your ack. Yellow banner with chips for each changed field, "Mark as reviewed" + "View changes" actions. Resolves via `forked_from_plant_id` for shallow forks added through bulk-add — the chip's source of truth is always the global catalogue row.
- **"Refresh now" button (Sage+)** — Wave 5 button to the right of the "catalogue updated N days ago" pill. Triggers `manual-refresh-ai-plant` to re-ask Gemini against this plant; on success a toast reports how many fields changed and the chip clears. Disabled and tooltipped for 7 days after a successful refresh (or after a `rate_limited` edge response). Hidden for custom forks since they've opted out of catalogue updates.

##### AI editing flow

For `source = "ai"` plants, the Care tab shows a `<SourceChip>` indicating one of two states:

- **"AI"** (amber) — `overridden_fields` is empty/null. Care guide auto-updates when the cron finds new info.
- **"AI · Edited"** (purple) — `overridden_fields.length > 0`. User has edited a field, so the care guide no longer auto-updates.

**No "catalogue" language anywhere in the UI** — the data model still uses the catalogue/fork concept internally, but every label users see talks about "auto-updating care guides" instead.

**"Refresh Care Guide" button — always visible for AI plants. One endpoint, no Gemini call from the button.**

The button has a single behaviour across orphan / shallow-fork / global rows: invoke `manual-refresh-ai-plant` with the home plant id. The edge function resolves the global parent (linking an orphan to an existing global OR promoting the home row's data as a brand-new global), computes the **visible-field** diff between the home row and the catalogue, and applies any pending updates. The daily cron (`refresh-stale-ai-plants`) is the only thing that ever calls Gemini — the Refresh button just **pulls down** whatever the cron has already produced.

| Plant state | Button behaviour |
|-------------|------------------|
| AI, unedited, linked (shallow fork or pure global) | Enabled. Click → compares the home row's top-level columns to the global's. Toast: "Care guide is up to date" OR "Care guide refreshed — N fields updated". Modal closes so the form re-fetches the new top-level values. |
| AI, unedited, **orphan** (`forked_from_plant_id IS NULL`) | Enabled. Edge fn looks up a matching global by `scientific_name_key` then `common_name ILIKE`. If found, links + applies any field deltas. If not found, **promotes** the home row's existing data as the new global (no Gemini call) + links. Subsequent clicks treat it as a normal linked row. The user sees a single toast — they never see the "orphan" state. |
| AI, edited (custom fork) | **Disabled.** Title attribute explains the user has edited the plant; the explanation block below the chips points to "Revert Care Guide". |
| AI, server says rate-limited | Edge fn returns `rate_limited` → toast with cadence + retry time. Button re-enables on next render (no local lock). |

**Why no Gemini in the button.** Previously the button re-ran Gemini on every click and diffed against the stored guide. Even at `temperature: 0.2`, Gemini produced minor wording variation across calls → "N fields updated" noise → users saw "10 changes" 30 seconds after adding a plant. The new model removes that: the cron handles the (rare) real changes, the button just synchronises the home row to the catalogue's current values.

**Rate limit configuration.** The per-(user, plant) refresh cadence defaults to 7 days. It's overridable via the `AI_REFRESH_RATE_LIMIT_MINUTES` env var on the `manual-refresh-ai-plant` edge function — declared in `supabase/config.toml`'s `[edge_runtime.secrets]` block and sourced from `supabase/.env`. Local dev sets it to `1` so testers can re-fire Refresh every minute. The client doesn't keep its own local cache anymore (was a UX accelerator that diverged from the server's window); the `refreshing` button state during in-flight requests is the only client-side suppression.

**Error visibility.** When refresh fails, the toast surfaces the underlying error message rather than the generic "try again" string, and the raw error is `console.error`'d so developers can debug from the browser console. Specific failure modes have dedicated toasts:

- `rate_limited` / `Rate limit exceeded` / `429` → Specific toast built from the server's payload. Two response shapes are handled:
  - **Cadence-based** (`manual-refresh-ai-plant`): `{ rate_limit_minutes, retry_after }` → *"You can refresh this plant once per minute. You can try again in 30s."*
  - **Quota-based** (`_shared/rateLimit`, used by `plant-doctor` and most AI fns): `{ quota_per_hour, used, retry_after }` → *"You've used your hourly AI quota (50 calls/hour). You can try again in 23 min."*

  Both adapt the time-remaining unit (s / min / h / d) to whatever the server reports. Falls back to *"You've hit the AI rate limit."* if both metadata fields are missing.
- `ai_tier_required` → "This requires Sage or Evergreen."
- `not_an_ai_plant` → "Refresh is only available for AI plants."
- `link_to_global_failed` / `promote_to_global_failed` → "Couldn't link this plant to the catalogue — try again shortly."
- Anything else → "Couldn't refresh care guide: \<underlying message\>"

**Visible-field diff.** The diff only counts fields the user can actually see in the form (`USER_VISIBLE_CARE_FIELDS` in `_shared/aiPlantCatalogue.ts`): `plant_type`, `cycle`, `watering_min_days`, `watering_max_days`, `sunlight`, `flowering_season`, `harvest_season`, `pruning_month`, `propagation`, `attracts`, `is_toxic_pets`, `is_toxic_humans`, `indoor`, `is_edible`, `drought_tolerant`, `tropical`, `medicinal`, `cuisine`. Excluded from the diff: `description` (free-text Gemini noise), `common_name`/`scientific_name` (rarely change), `care_level`/`growth_rate`/`maintenance` (not rendered in the form), `thumbnail_url` (cosmetic).

User sees: a single toast saying "Care guide is up to date" — no mention of healing, linking, or catalogue. The orphan state is invisible.

**Saving from unedited (auto-updating) → DetachConfirmModal.** When the user changes an AI care field on an unedited row and clicks Save, `<DetachConfirmModal>` opens with the list of changed fields. Cancelling keeps the form state but doesn't save. Confirming saves the row + populates `overridden_fields` with the changed field names, flipping the chip to "AI · Edited".

**Saving from edited → silent merge.** No modal — new overrides merge into the existing `overridden_fields` list via `mergeOverriddenFields()`.

**"Revert Care Guide" button.** Visible only on edited (custom fork) plants. Opens `<ResetConfirmModal>` (component still named `Reset*` internally; user-facing copy says "Revert"). On confirm, calls the `revert_ai_plant_fork_in_place` RPC which restores `care_guide_data` + the editable top-level columns from the global parent, clears `overridden_fields`, and seeds `user_plant_ack` at the parent's current version. Toast: "{plant} reverted — auto-updates re-enabled."

**"You've edited these fields" panel.** A small purple block above the form on edited plants lists the field names currently in `overridden_fields` plus the inline explanation: "Because you've customised this plant, its care guide no longer auto-updates. Use Revert to rejoin automatic updates (your edits will be lost)."

**Per-field highlight inside the form (Wave 7 D9)** — `ManualPlantCreation` accepts two optional props that `PlantEditModal` passes down for AI plants:

- `highlightedFields={freshness.updated_care_fields}` — yellow background + "Updated" badge next to the labels of fields the cron just changed.
- `overriddenFields={plant.overridden_fields}` — purple background + "Custom" badge on fields the user explicitly edited.

If a field is in both lists, the purple Custom indicator wins (it's the more permanent state). Currently applied to MultiSelect fields (sunlight, flowering/harvest seasons, pruning months, propagation, attracts) and the Watering Interval block (the only shared treatment for `watering_min_days` + `watering_max_days`).

Components introduced this wave (all in `src/components/aiPlants/`):
- `SourceChip` — the catalogue/custom pill.
- `DetachConfirmModal` — the save warning.
- `ResetConfirmModal` — the reset warning.

Helpers:
- `src/lib/aiPlantOverrides.ts` exports `diffOverriddenFields` (form vs row diff) and `mergeOverriddenFields` (sorted/de-duplicated union).

#### 2. Schedule tab

- See what blueprints affect this plant; add new ones.

#### 3. Guides tab

- AI care guide (if Sage/Evergreen) + linked community guides.

#### 4. Light tab

- Lux history per area hosting this plant. Spot mismatches.

#### 5. Companions tab

- Beneficial + antagonistic plants. Drives garden layout decisions.

#### 6. Refresh from provider

- Re-fetches latest care data from Perenual / Verdantly / AI. Useful if the original entry was incomplete.

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Care + Light + Companions. |
| Botanist+ | + Perenual refresh. |
| Sage/Evergreen | + Guides AI care guide. |

### Common mistakes / pitfalls

- **Editing plant-level when you wanted per-instance.** Per-instance tweaks (this specific tomato's growth state) belong in Instance Edit Modal.
- **Refresh overwriting your edits.** Refresh from provider replaces care fields — back up first.

### Recommended workflows

- **After AI identify:** open the new plant → Refresh → confirm care fields look right.
- **Mid-season:** check Light + Companions to validate placement.

### What to do if something looks wrong

- **Empty care fields:** original add may have been "manual" with no provider data. Use Refresh.
- **Companion data missing:** that species isn't in the companion DB. Companion tab will show empty.

---

## Related reference files

- [Plant Assignment Modal](./07-plant-assignment-modal.md)
- [Instance Edit Modal](./08-instance-edit-modal.md)
- [The Shed](../03-garden-hub/01-the-shed.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/PlantEditModal.tsx`
- `src/components/PlantScheduleTab.tsx`
- `src/components/PlantGuidesTab.tsx`
- `src/components/LightTab.tsx`
- `src/components/CompanionPlantsTab.tsx`
- `src/lib/plantProvider.ts`
