import React from "react";
import { Plus } from "lucide-react";
import LocationOverviewCard, { type OverviewLocation } from "./LocationOverviewCard";
import { usePermissions } from "../../context/HomePermissionsContext";

/**
 * The Home dashboard centrepiece (new-home-dashboard plan §3.3): one card
 * per location, one row per area, responsive 1→2 column grid. Empty homes
 * fall through to the parent's EmptyGardenPanel — this component only
 * renders when at least one location exists.
 *
 * Since the stats+locations redesign Stage 4b it also hosts the inline
 * "Add location" button (gated `locations.create`) and each card carries the
 * per-location manage kebab — the home grid is now the manage-in-place surface.
 */

interface Props {
  locations: OverviewLocation[];
  /** Per-location "tasks today" counts (already computed by App). */
  locationTaskCounts: Record<string, number>;
  density: "simple" | "detailed";
  /** Per-area telemetry from home-overview (Phase 2); empty until it lands. */
  telemetryByArea?: Map<string, import("../../hooks/useHomeOverview").OverviewArea>;
  /** Opens the AddLocationSheet (HomeMain owns the sheet + its state). */
  onAddLocation: () => void;
  /** Refetch the grid after an inline create / rename / env / delete. */
  onLocationsChanged: () => void;
}

export default function GardenOverviewGrid({
  locations,
  locationTaskCounts,
  density,
  telemetryByArea,
  onAddLocation,
  onLocationsChanged,
}: Props) {
  const { can } = usePermissions();
  if (locations.length === 0) return null;
  return (
    <section data-testid="home-overview-grid">
      {/* The "Your garden" caption was dropped (dashboard-nav-tasks-tray
          redesign Stage 1, B11) — the grid of location cards below is
          self-evident, and stripping it breaks the monotone eyebrow ladder
          down the page. The Add-location affordance stays, right-aligned. */}
      {can("locations.create") && (
        <div className="flex items-center justify-end px-1 mb-2">
          <button
            type="button"
            data-testid="home-add-location-btn"
            onClick={onAddLocation}
            className="flex items-center gap-1 text-[11px] font-black text-rhozly-primary bg-rhozly-primary/5 px-2.5 py-1 rounded-full can-hover:hover:bg-rhozly-primary/10 active:scale-[0.97] transition"
          >
            <Plus size={12} /> Add location
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {locations.map((loc) => (
          <LocationOverviewCard
            key={loc.id}
            location={loc}
            tasksToday={locationTaskCounts[loc.id] ?? 0}
            density={density}
            telemetryByArea={telemetryByArea}
            onChanged={onLocationsChanged}
          />
        ))}
      </div>
    </section>
  );
}
