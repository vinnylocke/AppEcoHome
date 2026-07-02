import React from "react";
import LocationOverviewCard, { type OverviewLocation } from "./LocationOverviewCard";

/**
 * The Home dashboard centrepiece (new-home-dashboard plan §3.3): one card
 * per location, one row per area, responsive 1→2 column grid. Empty homes
 * fall through to the parent's EmptyGardenPanel — this component only
 * renders when at least one location exists.
 */

interface Props {
  locations: OverviewLocation[];
  /** Per-location "tasks today" counts (already computed by App). */
  locationTaskCounts: Record<string, number>;
  density: "simple" | "detailed";
  /** Per-area telemetry from home-overview (Phase 2); empty until it lands. */
  telemetryByArea?: Map<string, import("../../hooks/useHomeOverview").OverviewArea>;
}

export default function GardenOverviewGrid({ locations, locationTaskCounts, density, telemetryByArea }: Props) {
  if (locations.length === 0) return null;
  return (
    <section data-testid="home-overview-grid">
      <h2 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-2">
        Your garden
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {locations.map((loc) => (
          <LocationOverviewCard
            key={loc.id}
            location={loc}
            tasksToday={locationTaskCounts[loc.id] ?? 0}
            density={density}
            telemetryByArea={telemetryByArea}
          />
        ))}
      </div>
    </section>
  );
}
