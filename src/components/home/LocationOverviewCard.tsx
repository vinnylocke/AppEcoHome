import React from "react";
import { useNavigate } from "react-router-dom";
import { Home as HomeIcon, TreeDeciduous, AlertTriangle, CheckCircle2 } from "lucide-react";
import AreaRow, { type AreaRowPlant } from "./AreaRow";
import LocationManageMenu from "./LocationManageMenu";

/**
 * One card per location in the Garden Overview grid (new-home-dashboard
 * plan §3.3). Header shows environment + hazard + today's task load;
 * the body is one AreaRow per area. Header tap opens the existing
 * LocationPage drill-in; area rows land on the same page (area modals
 * open from there).
 */

export interface OverviewLocation {
  id: string;
  name: string;
  is_outside: boolean | null;
  hazard?: string | null;
  areas?: Array<{ id: string; name: string }> | null;
  inventory_items?: Array<{
    id: string;
    status: string | null;
    area_id: string | null;
    growth_state: string | null;
    plant_name: string | null;
  }> | null;
}

interface Props {
  location: OverviewLocation;
  tasksToday: number;
  density: "simple" | "detailed";
  /** Per-area telemetry from home-overview (Phase 2); empty until it lands. */
  telemetryByArea?: Map<string, import("../../hooks/useHomeOverview").OverviewArea>;
  /** Refetch the grid after an inline manage action (Stage 4b). */
  onChanged?: () => void;
}

export default function LocationOverviewCard({ location, tasksToday, density, telemetryByArea, onChanged }: Props) {
  const navigate = useNavigate();
  const areas = location.areas ?? [];
  const items = location.inventory_items ?? [];

  const plantsByArea = new Map<string, AreaRowPlant[]>();
  const unassigned: AreaRowPlant[] = [];
  for (const item of items) {
    if (item.area_id && areas.some((a) => a.id === item.area_id)) {
      const list = plantsByArea.get(item.area_id) ?? [];
      list.push(item);
      plantsByArea.set(item.area_id, list);
    } else {
      unassigned.push(item);
    }
  }

  const openLocation = () => navigate(`/dashboard?locationId=${location.id}`);

  return (
    <div
      data-testid={`home-location-card-${location.id}`}
      className="bg-rhozly-surface-lowest rounded-card shadow-card border border-rhozly-outline/10 overflow-hidden"
    >
      {/* Header row: the drill-in is its own <button> (icon + name); the tasks
          chip + manage kebab are SIBLINGS, not nested — button-in-button is
          invalid HTML, and the kebab needs its own click target (Stage 4b). */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <button
          onClick={openLocation}
          className="flex-1 min-w-0 flex items-center gap-2.5 text-left rounded-lg can-hover:hover:opacity-80 transition"
        >
          <div className="bg-rhozly-primary/10 p-2 rounded-xl shrink-0">
            {location.is_outside ? (
              <TreeDeciduous size={16} className="text-rhozly-primary" />
            ) : (
              <HomeIcon size={16} className="text-rhozly-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-rhozly-on-surface truncate">{location.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40">
              {location.is_outside ? "Outdoors" : "Indoors"} · {areas.length} area{areas.length === 1 ? "" : "s"} · {items.length} plant{items.length === 1 ? "" : "s"}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {tasksToday > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-black text-rhozly-primary bg-rhozly-primary/10 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={12} />
              {tasksToday}
            </span>
          )}
          {onChanged && (
            <LocationManageMenu
              location={{ id: location.id, name: location.name, is_outside: location.is_outside }}
              onChanged={onChanged}
            />
          )}
        </div>
      </div>

      {location.hazard && (
        <div className="mx-4 mb-1 flex items-center gap-1.5 text-[11px] font-bold text-status-caution-ink bg-status-caution-fill border border-status-caution-line px-2.5 py-1.5 rounded-xl">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="truncate">{location.hazard}</span>
        </div>
      )}

      <div className="px-1.5 pb-2">
        {areas.length === 0 ? (
          <button
            onClick={openLocation}
            className="w-full text-left px-3 py-2.5 text-[12px] font-bold text-rhozly-primary can-hover:hover:bg-rhozly-primary/5 rounded-2xl transition"
          >
            + Add an area to start tracking plants here
          </button>
        ) : (
          areas.map((area) => (
            <AreaRow
              key={area.id}
              areaName={area.name}
              plants={plantsByArea.get(area.id) ?? []}
              density={density}
              telemetry={telemetryByArea?.get(area.id) ?? null}
              onClick={openLocation}
            />
          ))
        )}
        {unassigned.length > 0 && (
          <AreaRow
            areaName="Not in an area yet"
            plants={unassigned}
            density={density}
            onClick={openLocation}
          />
        )}
      </div>
    </div>
  );
}
