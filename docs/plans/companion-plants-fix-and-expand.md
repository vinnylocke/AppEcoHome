# Plan — Companion Plants: Name Fix + Inline Info Panel

## Problem 1 — "Unknown" names (bug)

The Verdantly `/v2/companion-planting/{id}` response uses different field names than our mapper assumed.

**Actual response shape:**
```json
{
  "data": {
    "plant": { "id": "...", "commonName": "Basil", "scientificName": "..." },
    "beneficial": [
      {
        "plantId": null,
        "commonName": "tomato",
        "scientificName": null,
        "relationshipType": "beneficial",
        "benefitType": "pest_control",
        "description": "Basil repels whiteflies...",
        "source": "almanac"
      }
    ],
    "harmful": [],
    "neutral": []
  },
  "meta": { "version": "v2" }
}
```

**What we mapped (wrong):** `item.id`, `item.name`, `item.reason`
**What we should map:** `item.plantId`, `item.commonName`, `item.description`

**Fix in `supabase/functions/companion-planting/index.ts`:**
```ts
const mapItem = (item: any): CompanionPlant => ({
  id: item.plantId ?? null,
  name: item.commonName ?? item.name ?? "Unknown",
  scientificName: item.scientificName ?? null,
  reason: item.description ?? item.reason ?? null,
});

// raw = rawResponse.data  (already correct — data.beneficial/harmful/neutral)
```

---

## Problem 2 — Info expand panel (improvement)

Add a clickable info button on each companion plant row. Clicking it expands an inline detail panel showing:
1. A plant image gallery (fetched from `plant-image-search` using the common name)
2. The relationship description is already shown in the row — no duplication needed

**Behaviour:**
- One info icon (`Info` from lucide) per plant row, right-aligned
- Clicking it toggles an inline expanded section below that row (only one open at a time)
- Image fetch is triggered on first expand and cached in component state
- While loading: 3 skeleton image tiles (match PlantInfoPanel gallery style)
- If no images found: hide the expanded section entirely (or just close)

**Note on care pills:** The Verdantly companion items have `plantId: null` in most cases (basil example shows all nulls), so we cannot fetch full care data. The expand panel shows images only — not care pills. This is correct — care pills require a full Verdantly details fetch which isn't available without a plantId.

---

## Files changed

| File | Change |
|---|---|
| `supabase/functions/companion-planting/index.ts` | Fix `mapItem` field names |
| `src/components/CompanionPlantsTab.tsx` | Add inline image expand panel |

No new files, no migration needed.
