# Home Climate Settings Tab

> The "Settings" sub-tab inside a home card. Edit identity (name, address, country, timezone) plus climate metadata (hardiness zone auto-fetched, climate zone, lat/lng).

**Trigger:** Settings sub-tab of a home card on `/home-management`.
**Source files:**
- `src/components/HomeManagement.tsx` — settings tab block
- `src/lib/hardinessZone.ts` — `fetchUsdaZone(lat, lng)` USGS wrapper

---

## Quick Summary

Inline-edit form for the home's metadata. Most fields are simple text/dropdown. Hardiness zone is fetched automatically when lat/lng changes (or via a manual "Recalculate" button). Climate zone is currently read-only (drawn from Köppen classification when available).

The home's lat/lng comes from the postcode/geocoding step during HomeSetup; if missing, browser geolocation may fill it in elsewhere in the app.

---

## Role 1 — Technical Reference

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| name | text | Display label |
| address | text | Free-text |
| country | dropdown (COUNTRIES) | Drives some defaults |
| timezone | dropdown (`Intl.supportedValuesOf("timeZone")`) | Time-aware logic |
| lat / lng | hidden (read-only display) | Geocoded |
| hardiness_zone | string (auto + manual recalc) | USDA zone code |
| climate_zone | read-only | Köppen e.g. "Cfb" |

### Local state (relevant subset)

| State | Purpose |
|-------|---------|
| `editingForms[homeId]` | Active edit form per home |
| `savingHomeId` | Save in flight |
| `recalculatingZones` | Set of home IDs with hardiness recalc in progress |
| `debounceRef` | Debounce save on text input |

### Data flow — write paths

#### Save edits
```ts
supabase.from("homes").update({
  name, address, country, timezone, lat, lng,
}).eq("id", homeId);
```

#### Recalculate hardiness
```ts
const zone = await fetchUsdaZone(lat, lng);
supabase.from("homes").update({ hardiness_zone: zone }).eq("id", homeId);
```

`fetchUsdaZone` is a thin wrapper around the USDA Plant Hardiness Zone Map API.

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- Owner / Editor only — Viewers see read-only fields.

### Error states

| State | Result |
|-------|--------|
| Update fails | Toast |
| Recalculate fails | Silent — button stays usable |
| Lat/lng missing | Recalculate button hidden |

### Performance

- Per-field saves are debounced.
- Hardiness fetch happens only on explicit recalculate or save.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why edit climate settings

Most users set this during HomeSetup and never come back. You might need to revisit if:

- You moved house — re-set address + lat/lng.
- USDA released a new hardiness map and your zone changed.
- You realised the timezone was wrong (affects task due-dates).

### Every flow on this tab

#### 1. Edit name / address / country / timezone

- Tap the field → edit → save (debounced; explicit "Save" button also available).

#### 2. Recalculate hardiness zone

- Tap "Recalculate" → USDA API → zone updates.
- Useful after a move.

#### 3. Climate zone

- Read-only. Update path is not currently exposed (would need code change).

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Name | Display label |
| Country | Drives plant database defaults |
| Timezone | Affects when tasks are "due today" |
| Hardiness zone | USDA zone (e.g. 8a) — filters plant suggestions |
| Climate zone | Köppen classification (research-grade) |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Wrong timezone after travelling.** If your app shows tasks at the wrong day, check timezone.
- **Hardiness zone doesn't update without lat/lng.** Edit address first to re-geocode.
- **Hardiness zone is US-specific.** UK/EU users see USDA zones approximated from latitude — not as precise as RHS Hardiness Ratings (planned).

### Recommended workflows

- **After a move:** update address → wait for lat/lng to settle → Recalculate.
- **Annually:** glance the hardiness zone — confirms recommendations are still tuned.

### What to do if something looks wrong

- **Recalculate spins forever:** USDA API may be down. Retry later.
- **Climate zone empty:** not all coordinates resolve. Harmless — hardiness alone drives most decisions.
- **Save indicator stuck:** debounce flushing — give it a second, then refresh.

---

## Related reference files

- [Home Management — Overview](./01-home-management-overview.md)
- [Home Setup](../01-onboarding/03-home-setup.md)
- [Hemisphere & Seasonality (cross-cutting)](../99-cross-cutting/29-seasonality.md)
- [Weather (cross-cutting)](../99-cross-cutting/27-weather.md)

## Code references for ongoing maintenance

- `src/components/HomeManagement.tsx` — settings tab body
- `src/lib/hardinessZone.ts` — `fetchUsdaZone`
- `src/constants/countries.ts` — country list
- `Intl.supportedValuesOf("timeZone")` — TZ list
