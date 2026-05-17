# Plan — Strip PII from AI Prompts

## Goal
Ensure no personal data reaches Gemini. Replace precise location data with
an anonymised `LocationContext`, remove user names from prompts, swap home/area
names for IDs (mapped back server-side), and add a UI hint on free-text fields.

---

## What Changes and Why

### 1. New shared utility — `_shared/locationContext.ts`
Single place that converts a home record into a safe location descriptor:
- Reverse-geocodes `lat`/`lng` to **city/town** via Nominatim (OpenStreetMap, free, no key)
- Falls back through `city → town → village → county` in the Nominatim response
- Returns: `{ hemisphere, country, city, climateZone, hardinessZone }`
- Raw `lat`/`lng` never leave this file — everything downstream gets the struct above

Nominatim ToS: requires a User-Agent header, 1 req/sec max — fine at our scale.

### 2. Modify `_shared/userContext.ts`
- Remove `firstName`, `displayName`, `lat`, `lng`, `country` fields
- `identity` context block removed — AI no longer addresses users by name
- Location block replaced with `LocationContext` struct from above

### 3. ID aliasing helper — `_shared/idAlias.ts`
Small utility used by functions that reference home/area names in output:
```ts
buildAliasMap(items: { id: string; name: string }[]) → Map<id, name>
restoreNames(text: string, map: Map<id, name>) → string  // simple string replace
restoreNamesInObject(obj: unknown, map: Map<id, name>) → unknown  // walks JSON
```
Gemini sees e.g. `"area_id":"00000000-0000-0000-0002-000000000001"`.
After Gemini responds, `restoreNames` / `restoreNamesInObject` swaps IDs back
to names before the response leaves the edge function.

---

## Files Modified

| File | Change |
|------|--------|
| `_shared/locationContext.ts` | **NEW** — Nominatim reverse geocode → LocationContext |
| `_shared/idAlias.ts` | **NEW** — ID alias build + restore helpers |
| `_shared/userContext.ts` | Remove firstName/displayName/lat/lng; use LocationContext |
| `plant-doctor-ai/index.ts` | Remove identity block; replace lat/lng/country with LocationContext |
| `plant-doctor/index.ts` | Replace deviceLat/deviceLng in prompt with LocationContext |
| `generate-landscape-plan/index.ts` | LocationContext; area names → IDs; restore after Gemini |
| `optimise-area-ai/index.ts` | LocationContext; area names → IDs; restore after Gemini |
| `scan-area/index.ts` | Area name → area ID; describe area by properties only |
| `smart-plant-scheduler/index.ts` | Keep weather lat/lng; replace address in Gemini prompt with LocationContext |
| `pattern-evaluate/index.ts` | LocationContext; area name → area ID |
| `generate-swipe-plants/index.ts` | Remove userId from any logged/prompt context |
| `src/components/AilmentWatchlist.tsx` | Add hint under extraContext field: "Tip: avoid including personal details" |

**Not changed:** plant names, planted dates, task/blueprint names, weather data, Open-Meteo calls, garden-reports email scaffolding (user's own email to themselves).

---

## What Gemini Sees After This Change

**Location (example):**
```
Location: London, United Kingdom | Hemisphere: Northern
Climate zone: Temperate Oceanic | Hardiness zone: 9a
```

**Areas (example, in optimise-area-ai):**
```json
{ "area_id": "00000000-0000-0000-0002-000000000001",
  "properties": "Outdoor raised bed, pH 6.5, Well-Drained, Full sun 8000 lux" }
```
After Gemini responds, all `area_id` values are replaced with "Back Garden Raised Bed"
server-side before the response leaves the function.

**Identity:** No name, no email, no user ID. Prompts say "the gardener" where a
personal reference was previously used.

---

## Risks & Edge Cases

- **Nominatim rate limit**: 1 req/s max — fine at our AI call frequency. Add
  a try/catch that falls back to `country` only if the call fails.
- **Nominatim city resolution**: Some rural coordinates return a county/district
  rather than a city. The fallback chain (`city → town → village → county`) handles
  this gracefully — precision may be slightly lower in rural areas, which is acceptable.
- **ID restore in text responses**: `restoreNames` does a global string replace —
  UUIDs won't collide with any other content in the response. Safe.
- **Landscape plan text**: Gemini is instructed to use the area_id token when
  referencing the area. The restored name is substituted before the plan reaches
  the client. The prompt will include an example: `"always use the area_id value
  (e.g. '00000000-...') when referring to an area — never invent a name"`.

---

## No Migration Required
City/town is computed on demand from stored lat/lng. Not persisted.

---

## Process
1. Write `_shared/locationContext.ts` and `_shared/idAlias.ts` first and test locally
2. Update `_shared/userContext.ts` (one change, fixes plant-doctor-ai automatically)
3. Update each edge function in order of the table above
4. Run `supabase functions serve` locally and smoke-test each changed function
5. Deploy with `--bump 12` (12 files changed)
