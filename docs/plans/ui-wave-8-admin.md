# UI Wave 8 — Admin (Audit + Plant Library) polish

## Goal

Investigation found nearly everything the audit flagged is already done:

| Audit ask | Status |
|---|---|
| AuditPage default 30-day range (not Today) | ✅ Already shipped |
| AuditPage column tooltips (Input/Output/Total/Images/Cost) | ✅ Already shipped + Wave 2 made them persona-aware |
| AuditPage mobile-collapsed columns | ✅ Already shipped (`hidden sm:table-cell`) |
| AuditPage cost forecast | ✅ Already shipped ("On track for $X this month") |
| AuditPage feature summary cards | ✅ Already shipped |
| AuditPage CSV / PDF export | ✅ Already shipped |
| PlantLibraryAdmin stats strip | ✅ Already shipped (total / verified / matched / amended / unverified) |
| PlantLibraryAdmin per-model cost breakdown | ✅ Already shipped |

What's genuinely missing:

**AuditPage — Today / Week / Month cost strip** at the top of the AI Usage tab. The cost forecast card shows monthly projection but doesn't surface the simple "what did we spend today?" answer. A 3-card strip (Today · This Week · This Month) is the most-asked-for missing view.

That's the entire wave. Single targeted improvement, real admin value.

## Sensible-default decisions

| Decision | Choice |
|---|---|
| Library composition pie chart | **Defer** — current stats strip covers the key splits. A chart is glossier but the stats strip is already informative. |
| PlantLibraryAdmin daily/weekly cost rollups | **Defer** — AuditPage AI Usage tab already serves this need for cross-feature spend. Adding library-specific cost rollups would duplicate. |
| Run history filtering | **Defer** — current run history works fine for the typical small number of runs/day. |

## App-reference files consulted

- [`docs/app-reference/07-management/05-audit-page.md`](docs/app-reference/07-management/05-audit-page.md)

## Files

| File | Change |
|---|---|
| `src/components/AuditPage.tsx` | Add a 3-tile cost strip (Today · This Week · This Month) above the existing forecast bar on the AI Usage tab. Computed from existing `aiUsage` array — no extra fetches. |

## Steps

1. Add `costByRange` useMemo computing today/week/month sums.
2. Render the 3-tile strip above the forecast row.
3. Typecheck + tests + deploy.
