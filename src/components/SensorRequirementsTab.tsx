import React, { useEffect, useMemo, useState } from "react";
import { Droplets, Gauge, Thermometer, Sparkles, Loader2, Lock, Info } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import {
  buildSensorRequirementRows,
  hasAnySensorRange,
  hasAllSensorRanges,
  type PlantSoilRanges,
  type SensorRequirementKey,
} from "../lib/sensorRequirements";
import { generatePlantSensorRanges } from "../services/sensorRequirementsService";

/**
 * Soil Requirements tab — shows a plant's ideal soil moisture / EC / soil-temp
 * ranges (the same authoritative values the AI Area Coach compares live sensor
 * readings against). Viewing is free for every tier; generating with AI is
 * gated on `aiEnabled`. Used by both PlantDetailModal (preview) and
 * PlantEditModal (owned plant in The Shed).
 */

interface PlantLike extends PlantSoilRanges {
  id?: number | null;
  plantId?: number | null;
  common_name?: string | null;
  plant_name?: string | null;
}

interface Props {
  plant: PlantLike;
  homeId: string | null;
  aiEnabled: boolean;
  /** Fired with the freshly-generated ranges so the host can merge them into its plant state. */
  onGenerated?: (ranges: PlantSoilRanges) => void;
}

const ICONS: Record<SensorRequirementKey, typeof Droplets> = {
  moisture: Droplets,
  ec: Gauge,
  temp: Thermometer,
};

const HINTS: Record<SensorRequirementKey, string> = {
  moisture: "Volumetric soil moisture the plant is happiest in.",
  ec: "Nutrient/salinity level in the soil water (calibrated µS/cm).",
  temp: "Ideal root-zone soil temperature.",
};

export default function SensorRequirementsTab({ plant, homeId, aiEnabled, onGenerated }: Props) {
  // Local overlay so the tab reflects a just-generated result without waiting
  // for the host to refetch. Merged over the incoming plant.
  const [generated, setGenerated] = useState<PlantSoilRanges | null>(null);
  const [fetched, setFetched] = useState<PlantSoilRanges | null>(null);
  const [busy, setBusy] = useState(false);

  const plantId = plant.id ?? plant.plantId ?? null;

  // The catalogue-plant shape passed by PlantDetailModal doesn't carry the
  // soil_* columns, so read the authoritative current values from `plants` by
  // id. PlantEditModal passes them inline but re-reading keeps a single source.
  useEffect(() => {
    let cancelled = false;
    if (plantId == null || plantId <= 0) { setFetched(null); return; }
    supabase
      .from("plants")
      .select("soil_moisture_min, soil_moisture_max, soil_ec_min, soil_ec_max, soil_temp_min, soil_temp_max")
      .eq("id", plantId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setFetched((data as PlantSoilRanges) ?? null); });
    return () => { cancelled = true; };
  }, [plantId]);

  const merged: PlantSoilRanges = useMemo(
    () => ({ ...plant, ...(fetched ?? {}), ...(generated ?? {}) }),
    [plant, fetched, generated],
  );
  const rows = useMemo(() => buildSensorRequirementRows(merged), [merged]);
  const hasAny = hasAnySensorRange(merged);
  const hasAll = hasAllSensorRanges(merged);

  const canGenerate = aiEnabled && plantId != null && plantId > 0;

  const handleGenerate = async () => {
    if (!canGenerate || plantId == null) return;
    setBusy(true);
    try {
      const ranges = await generatePlantSensorRanges(plantId, homeId);
      if (!hasAnySensorRange(ranges)) {
        toast.error("Couldn't work out soil requirements for this plant — try again later.");
        return;
      }
      setGenerated(ranges);
      onGenerated?.(ranges);
      toast.success("Soil requirements generated.");
    } catch (err: any) {
      Logger.error("Generate sensor requirements failed", err, { plantId, homeId }, err?.message || "Couldn't generate soil requirements.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="sensor-requirements-tab" className="space-y-4">
      <div>
        <h3 className="font-black text-lg text-rhozly-on-surface">Soil requirements</h3>
        <p className="text-sm font-bold text-rhozly-on-surface/50 mt-0.5">
          The ideal soil conditions for this plant — used to check your sensor readings and automations.
        </p>
      </div>

      {hasAny ? (
        <ul data-testid="sensor-requirements-list" className="space-y-2">
          {rows.map((r) => {
            const Icon = ICONS[r.key];
            return (
              <li
                key={r.key}
                data-testid={`sensor-req-${r.key}`}
                className="flex items-center gap-3 rounded-2xl bg-white border border-rhozly-outline/15 p-3.5"
              >
                <div className="w-9 h-9 shrink-0 rounded-xl bg-rhozly-primary/5 flex items-center justify-center text-rhozly-primary">
                  <Icon size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/45">{r.label}</p>
                  <p className="text-base font-black text-rhozly-on-surface leading-tight">
                    {r.hasValue ? r.display : <span className="text-rhozly-on-surface/35">Not set</span>}
                  </p>
                </div>
                <span title={HINTS[r.key]} className="shrink-0 text-rhozly-on-surface/25">
                  <Info size={14} />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div
          data-testid="sensor-requirements-empty"
          className="rounded-2xl border border-dashed border-rhozly-outline/25 bg-rhozly-surface-lowest p-5 text-center"
        >
          <Droplets size={22} className="mx-auto text-rhozly-primary/40 mb-2" />
          <p className="font-black text-sm text-rhozly-on-surface">No soil requirements yet</p>
          <p className="text-xs font-bold text-rhozly-on-surface/50 mt-1 leading-snug">
            Generate this plant's ideal soil moisture, EC and temperature ranges with AI. We'll keep a record so
            every gardener benefits.
          </p>
        </div>
      )}

      {/* Generate / regenerate — AI-gated. */}
      {canGenerate ? (
        <button
          type="button"
          data-testid="sensor-requirements-generate"
          onClick={handleGenerate}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-amber-300 text-sm font-black text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? "Generating…" : hasAll ? "Regenerate with AI" : hasAny ? "Fill the rest with AI" : "Generate with AI"}
        </button>
      ) : (
        !hasAny && (
          <div
            data-testid="sensor-requirements-ai-locked"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-rhozly-outline/20 text-xs font-bold text-rhozly-on-surface/40"
          >
            <Lock size={13} /> AI generation is available on plans with AI enabled
          </div>
        )
      )}
    </div>
  );
}
