# Area Details

> Modal that opens when you tap an area card from Location Page or Garden Layout. Drill-in for one specific area — its metrics, plants, history, microclimate, lux readings, AI-suggested fixes.

**Route:** Opened as a modal from `/dashboard?locationId=X` (LocationPage) and inside Garden Layout shapes.
**Source file:** `src/components/AreaDetails.tsx`

---

## Quick Summary

A modal with three or four tab sections: Overview (metrics + plants), Lux Readings (history graph), Microclimate (computed sun/wind), and AI Recommendations (Sage/Evergreen). The same fields editable in Location Manager are displayed here with more context — e.g. a lux history sparkline rather than a single value.

---

## Role 1 — Technical Reference

### Component graph

```
AreaDetails (modal)
├── Header (close, edit, area name)
├── Overview tab
│   ├── Metric chips (lux, pH, growing medium, water movement)
│   ├── Plant grid (inventory_items in this area)
│   ├── Today's tasks for this area
│   └── Edit Area button
├── Lux Readings tab
│   ├── Sparkline chart of `area_lux_readings`
│   └── Add Reading button → opens Light Sensor pre-scoped to this area
├── Microclimate tab
│   ├── Computed sun class (full sun / part shade / etc.) — from shapes + sun analysis
│   ├── Wind exposure rating
│   ├── Frost risk
│   └── Recent lux
└── AI Recommendations tab (Sage/Evergreen only)
    └── Calls `home-location-details` for AI-summarised insights
```

### Data flow — read paths

- Area row from props (passed in).
- `inventory_items.area_id = X` for plant grid.
- `area_lux_readings.area_id = X` for sparkline.
- `tasks.area_id = X AND due_date = today` for tasks.
- Microclimate computed client-side from shapes + recent weather snapshots.

### Data flow — write paths

- Edit metrics: same writes as Location Manager.
- "Dismiss recommendations": local state only (clears the AI suggestion).

### Edge functions invoked

- `home-location-details` — AI summary for this area (Sage/Evergreen only).

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `sync-weather` + `analyse-weather` | Indirect — drives microclimate computation |
| `update-plant-states` | Affects plant chips |

### Tier gating

- AI Recommendations tab hidden for non-AI tiers.

### Beta gating

None.

### Permissions

- `areas.edit` gates the Edit Area button.

### Error states

- AI recommendations fetch fails → empty state with retry.

### Performance

- Sparkline lazy-renders.
- Modal uses focus trap (Wave 1C).

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

The Area Details modal is the "zoom on one specific bed" view. It's where you confirm what's planted, see what's due today, glance the recent lux trend, and on AI tiers ask Rhozly to summarise.

### Every flow on this modal

1. **Read the metrics** — quickly confirm lux / pH / growing medium / water movement match reality.
2. **See plants in this area** — grid of inventory items. Tap one to open InstanceEditModal.
3. **Today's tasks for this area** — same TaskList, filtered.
4. **Lux Readings tab** — see trend over time. New reading? Tap Add Reading.
5. **Microclimate tab** — sun class, wind exposure, frost risk computed from shapes + weather.
6. **AI Recommendations (Sage/Evergreen)** — natural-language summary of how this area is doing and what to adjust.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Sun class | Computed from shape + sun analysis (full sun / part shade / shade) |
| Wind exposure | Sheltered / partly sheltered / exposed |
| Frost risk tonight | Tonight's min temp from weather snapshot |
| Recent lux | Last `area_lux_readings.lux` |
| Plants grid | inventory_items in this area |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | Overview + Lux + Microclimate. No AI tab. |
| Sage / Evergreen | All tabs including AI Recommendations. |

### Common mistakes / pitfalls

- **Metrics stale.** Lux + pH update only when you save them — they don't auto-detect.
- **Microclimate empty if no shapes drawn.** Computed from Garden Layout shapes — without a shape mapped to this area, the data is blank.

### Recommended workflows

- **After taking a lux reading:** save to area → open Area Details → confirm.
- **Mid-season check:** open every area in sequence → AI recommendations (if available) → adjust plantings if any flagged.

---

## Related reference files

- [Location Page](../02-dashboard/07-location-page.md)
- [Location Manager](./03-location-manager.md)
- [Light Sensor](./09-light-sensor.md)
- [Microclimate Report](./07-microclimate-report.md)

## Code references for ongoing maintenance

- `src/components/AreaDetails.tsx` — entire modal
- `src/components/AreaLuxReadings.tsx` — sparkline
- `supabase/functions/home-location-details/index.ts` — AI summary edge fn
