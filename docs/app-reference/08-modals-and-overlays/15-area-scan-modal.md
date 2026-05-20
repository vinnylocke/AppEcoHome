# Area Scan Modal

> AI-powered audit of an entire area from a photo. The user snaps a wide shot of a bed; the AI identifies plants, scores health, flags pests/diseases, suggests maintenance tasks + companion plants, and estimates capacity.

**Source file:** `src/components/AreaScanModal.tsx`

---

## Quick Summary

Photo of the bed → upload → AI returns a structured analysis: per-plant identification + health + position, area-level companion suggestions, maintenance task suggestions with urgency, pest/disease list, soil conditions, and a capacity estimate. User triages: accept suggestions to create tasks/ailments, dismiss the rest.

Sage / Evergreen feature.

---

## Role 1 — Technical Reference

### Component graph

```
AreaScanModal (Portal, focus-trapped)
├── Header (close, title, area name)
├── Photo capture step
│   ├── Take Photo / Library buttons
│   └── Preview + retake
├── (Optional) Pre-scan questions (per AI)
├── Analyse button → loading
├── Result step
│   ├── Summary card
│   ├── Capacity card
│   ├── Plants grid (per-plant cards)
│   ├── Companions list
│   ├── Maintenance suggestions (accept / dismiss per)
│   ├── Pests/Diseases list (link to Watchlist)
│   ├── Soil conditions block
│   └── Save / Done
```

### Result shape

```ts
{
  summary: string,
  capacity: { current_count, estimated_max, label },
  plants: PlantResult[],
  companions: [{ name, reason }],
  maintenance: MaintenanceSuggestion[],
  pests_diseases: PestDisease[],
  soil_conditions: {...},
}
```

`PlantResult` includes identified name + scientific + confidence + health status + position suitability.

### Pre-scan questions (`scanQuestions.ts`)

Some scans benefit from a few up-front questions (e.g. "Is this a vegetable bed or ornamental?"). `getQuestionsToAsk(areaContext)` decides which to surface.

### Data flow — read paths

- Area metadata (name, plants currently in it) for context.

### Data flow — write paths

- Upload photo to `area-scans` bucket.
- `area_scans.insert(...)` — the scan record.
- Accepted maintenance: `task_blueprints.insert(...)`.
- Accepted pest/disease: `plant_instance_ailments.insert(...)` or link via LinkAilmentModal.
- `logEvent(AREA_SCAN_COMPLETED)`.

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `area-scan-analyse` | Gemini Vision analysis |

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

- Sage / Evergreen — AI gated.

### Beta gating

May be beta-gated during rollout.

### Permissions

- `inventory.read` + `tasks.write` for accept flows.

### Error states

| State | Result |
|-------|--------|
| Photo too large | Compressed |
| AI call fails | Toast + retry |
| Save partial fail | Toast; some suggestions applied |

### Performance

- Single AI call per scan.
- Result panel renders progressively as the analysis arrives.

### Linked storage buckets

- `area-scans` — uploaded photos.

---

## Role 2 — Expert Gardener's Guide

### Why use this scan

You walk past a bed. Something looks off but you can't tell what. The area scan asks the AI to do a holistic audit — what's planted, how does it look, what should you do, what's the soil saying. Five minutes of AI gives you a punch list.

### Every flow on this modal

#### 1. Snap a photo

- Wide shot of the bed. Daylight, fairly close.

#### 2. Optional questions

- "Is this an edible bed?" / "When did you last fertilise?" etc.

#### 3. Analyse

- AI returns a structured report.

#### 4. Review

- Each suggestion has Accept / Dismiss.
- Accept = creates tasks / ailment links.
- Dismiss = ignored, not saved.

#### 5. Save scan

- Persists the scan record for future reference.

### Tier-by-tier experience

Sage / Evergreen only.

### Common mistakes / pitfalls

- **Blurry photo.** Steady the phone before shooting.
- **Cluttered bed.** Too many plants in one shot may confuse the AI — try multiple smaller shots.
- **Accepting everything.** Read each suggestion; not all will be relevant.

### Recommended workflows

- **Quarterly:** scan every active area.
- **After incident:** if a bed underperforms, scan to get a fresh perspective.

### What to do if something looks wrong

- **AI mis-identified a plant:** dismiss that row; tell the AI via feedback if available.
- **No pests in real life but AI flagged some:** dismiss with confidence; reality wins.

---

## Related reference files

- [Plant Doctor](../05-tools/02-plant-doctor.md)
- [Ailment Watchlist](../03-garden-hub/02-watchlist.md)
- [Area Details](../03-garden-hub/04-area-details.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/AreaScanModal.tsx`
- `src/lib/scanQuestions.ts`
- `supabase/functions/area-scan-analyse/index.ts`
- `area-scans` bucket
