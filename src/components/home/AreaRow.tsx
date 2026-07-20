import React from "react";
import { ChevronRight, Droplets, Thermometer, BatteryLow, CheckCircle2, AlertTriangle } from "lucide-react";
import type { OverviewArea } from "../../hooks/useHomeOverview";

/**
 * One row per area inside a LocationOverviewCard (new-home-dashboard plan
 * §3.3). Plants (count + growth-state dots) come from client-side data;
 * the optional `telemetry` prop (Phase 2, home-overview endpoint) adds
 * soil-sensor, valve and per-area task chips.
 */

export interface AreaRowPlant {
  id: string;
  status: string | null;
  growth_state: string | null;
  plant_name: string | null;
}

interface Props {
  areaName: string;
  plants: AreaRowPlant[];
  /** "simple" hides the growth-state breakdown text; "detailed" shows it. */
  density: "simple" | "detailed";
  /** Per-area telemetry from home-overview; null until the fetch lands. */
  telemetry?: OverviewArea | null;
  onClick: () => void;
}

// Soil banding mirrors _shared/homeOverview.ts soilBand. status-* token
// families (not raw palette) so soil chips honour High Contrast mode.
function soilLabel(moisture: number): { label: string; classes: string } {
  if (moisture < 30) return { label: "Dry", classes: "bg-status-caution-fill text-status-caution-ink" };
  if (moisture > 70) return { label: "Wet", classes: "bg-status-water-fill text-status-water-ink" };
  return { label: "OK", classes: "bg-status-success-fill text-status-success-ink" };
}

function minutesLeft(untilIso: string): number {
  return Math.max(0, Math.round((Date.parse(untilIso) - Date.now()) / 60_000));
}

function SensorChip({ sensor, density }: { sensor: NonNullable<OverviewArea["sensor"]>; density: "simple" | "detailed" }) {
  if (sensor.moisture == null) return null;
  // Beyond 24h the number is more misleading than helpful — grey it out.
  const stale = (sensor.readingAgeMin ?? 0) > 24 * 60;
  const band = soilLabel(sensor.moisture);
  return (
    <span
      data-testid="home-sensor-chip"
      title={stale ? "Last reading over a day old" : `Soil reading ${sensor.readingAgeMin ?? "?"} min ago`}
      className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${stale ? "bg-gray-100 text-gray-400" : band.classes}`}
    >
      <Droplets size={10} />
      {density === "simple"
        ? `Soil: ${band.label}`
        : `${Math.round(sensor.moisture)}%`}
      {density === "detailed" && sensor.tempC != null && (
        <>
          <Thermometer size={10} className="ml-0.5" />
          {sensor.tempC.toFixed(1)}°
        </>
      )}
      {density === "detailed" && sensor.batteryPercent != null && sensor.batteryPercent < 25 && (
        <BatteryLow size={10} className="ml-0.5 text-orange-500" />
      )}
    </span>
  );
}

function ValveChip({ valve, density }: { valve: NonNullable<OverviewArea["valve"]>; density: "simple" | "detailed" }) {
  if (valve.state === "running") {
    return (
      <span data-testid="home-valve-chip" className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-status-water-fill text-status-water-ink">
        {/* Static filled dot — the "Watering" label already communicates the
            live state; a pulsing dot per row blows the ≤1-live-element budget. */}
        <span className="w-1.5 h-1.5 rounded-full bg-status-water-ink" />
        {density === "simple" || !valve.runningUntil
          ? "Watering"
          : `Watering · ${minutesLeft(valve.runningUntil)} min left`}
      </span>
    );
  }
  if (valve.state === "failed") {
    return (
      <span data-testid="home-valve-chip" className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-status-danger-fill text-status-danger-ink">
        <AlertTriangle size={10} />
        Valve failed
      </span>
    );
  }
  if (density === "detailed" && valve.nextRunAt) {
    const next = new Date(valve.nextRunAt);
    return (
      <span data-testid="home-valve-chip" className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rhozly-primary/5 text-rhozly-on-surface/60">
        Next water {next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  }
  return null;
}

// Growth-state → dot colour. Grey = not planted yet.
const STATE_COLOURS: Record<string, string> = {
  "Germination": "bg-sky-400",
  "Seedling": "bg-lime-400",
  "Vegetative": "bg-green-500",
  "Budding/Pre-Flowering": "bg-amber-400",
  "Flowering/Bloom": "bg-pink-400",
  "Fruiting/Pollination": "bg-orange-400",
  "Ripening/Maturity": "bg-yellow-400",
  "Senescence": "bg-stone-400",
};

const MAX_DOTS = 5;

function dotColour(plant: AreaRowPlant): string {
  if (plant.status !== "Planted") return "bg-gray-300";
  return STATE_COLOURS[plant.growth_state ?? ""] ?? "bg-green-500";
}

export default function AreaRow({ areaName, plants, density, telemetry, onClick }: Props) {
  const dots = plants.slice(0, MAX_DOTS);
  const extra = plants.length - dots.length;

  const chips: React.ReactNode[] = [];
  if (telemetry?.sensor) chips.push(<SensorChip key="sensor" sensor={telemetry.sensor} density={density} />);
  if (telemetry?.valve) chips.push(<ValveChip key="valve" valve={telemetry.valve} density={density} />);
  if (telemetry && telemetry.tasksToday > 0) {
    chips.push(
      <span key="tasks" data-testid="home-area-tasks-chip" className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary">
        <CheckCircle2 size={10} />
        {density === "simple" ? "" : telemetry.tasksToday}
      </span>,
    );
  }

  return (
    <button
      data-testid={`home-area-row-${areaName.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl can-hover:hover:bg-rhozly-primary/5 transition text-left group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-rhozly-on-surface truncate">{areaName}</p>
        {/* The growth-state breakdown text was cut (redesign Stage 3) — the
            coloured dots on the right already encode each plant's state, so the
            prose ("3 flowering · 2 seedling") just restated them one line down. */}
        {chips.length > 0 && (
          <span className="flex flex-wrap items-center gap-1 mt-1">{chips}</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {plants.length === 0 ? (
          <span className="text-[11px] font-bold text-rhozly-on-surface/35">No plants yet</span>
        ) : (
          <>
            {/* The bare plant-count number was cut from the VISIBLE row
                (redesign Stage 3) — the dots + "+N" overflow already show
                quantity for sighted users. But the dots are `aria-hidden`, so
                an sr-only count keeps the per-area quantity in the accessibility
                tree (the location subtitle only sums the whole location). */}
            <span className="sr-only">
              {plants.length} plant{plants.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-1" aria-hidden>
              {dots.map((p) => (
                <span
                  key={p.id}
                  title={`${p.plant_name ?? "Plant"}${p.status === "Planted" && p.growth_state ? ` — ${p.growth_state}` : p.status !== "Planted" ? " — not planted yet" : ""}`}
                  className={`w-2.5 h-2.5 rounded-full ${dotColour(p)}`}
                />
              ))}
              {extra > 0 && (
                <span className="text-[10px] font-black text-rhozly-on-surface/45">+{extra}</span>
              )}
            </div>
          </>
        )}
        <ChevronRight size={14} className="text-rhozly-on-surface/25 group-hover:text-rhozly-primary transition" />
      </div>
    </button>
  );
}
