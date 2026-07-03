import React, { useState } from "react";
import { Check, Droplets, Loader2, Thermometer, X } from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../../lib/errorHandler";
import { usePersona } from "../../hooks/usePersona";
import {
  logManualReading,
  validateManualReading,
} from "../../services/areaReadingsService";

// RHO-17 Phase 2 — manual soil-reading capture from an area card in the
// Garden Walk. A thin walk-styled sheet over the EXISTING manual write
// path: areaReadingsService.logManualReading → area_moisture_readings /
// area_temp_readings with source='manual'. recordedAt is omitted so the
// reading is stamped "now" (the ticket's requirement); DB triggers bump
// areas.latest_soil_* so the Area details Readings tab, drydown profiles
// and the AI Area Coach pick it up for free. Backdating and EC entry
// stay in the full LogReadingModal (Area details → Readings tab).

interface Props {
  homeId: string;
  areaId: string;
  areaName: string;
  onClose: () => void;
  /** Fires after a successful write — the walk records a reading_logged
   *  section visit + bumps the session's readings_logged metric. */
  onLogged: () => void;
}

function humanise(code: string): string {
  switch (code) {
    case "nothing_entered":
      return "Enter moisture or temperature before saving.";
    case "moisture_out_of_range":
      return "Moisture must be between 0 and 100%.";
    case "temp_out_of_range":
      return "Soil temperature must be between -50 and 80°C.";
    default:
      return "Couldn't save the reading — try again.";
  }
}

export default function WalkReadingSheet({
  homeId,
  areaId,
  areaName,
  onClose,
  onLogged,
}: Props) {
  // §11 persona pass — the "new" persona (null ⇒ new) gets field helper
  // text with typical ranges; "experienced" gets bare inputs.
  const persona = usePersona();
  const isNewGardener = persona !== "experienced";
  const [moisture, setMoisture] = useState("");
  const [temp, setTemp] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const moisturePct = moisture.trim() === "" ? undefined : Number(moisture);
    const tempC = temp.trim() === "" ? undefined : Number(temp);
    const input = { homeId, areaId, moisturePct, tempC };

    const validation = validateManualReading(input);
    if (validation !== null) {
      toast.error(humanise(validation));
      return;
    }

    setSaving(true);
    try {
      // recordedAt omitted → stamped now inside logManualReading.
      await logManualReading(input);
      toast.success(`Reading logged for ${areaName}`);
      onLogged();
      onClose();
    } catch (err: unknown) {
      Logger.error("WalkReadingSheet save failed", err, { homeId, areaId });
      toast.error(
        err instanceof Error ? humanise(err.message) : humanise("unknown"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="walk-reading-sheet"
      className="fixed inset-0 z-50 bg-rhozly-bg/95 backdrop-blur-sm flex flex-col"
    >
      <header
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        className="shrink-0 px-4 pb-2 flex items-center justify-between"
      >
        <p className="font-display font-black text-rhozly-on-surface">
          Log a reading — {areaName}
        </p>
        <button
          type="button"
          data-testid="walk-reading-close"
          onClick={onClose}
          aria-label="Close"
          className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 flex items-center justify-center"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 space-y-4">
        <p className="text-xs font-bold text-rhozly-on-surface/55 leading-snug">
          {isNewGardener
            ? "Fill in what you measured — either field on its own is fine. The reading is stamped with right now."
            : "Either field on its own is fine — stamped now."}
        </p>

        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
            <Droplets size={14} className="text-blue-600" /> Soil moisture
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              placeholder="0 – 100"
              min={0}
              max={100}
              step="any"
              value={moisture}
              onChange={(e) => setMoisture(e.target.value)}
              data-testid="walk-reading-moisture"
              className="flex-1 px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors"
            />
            <span className="text-xs font-black text-rhozly-on-surface/55 min-w-[3rem]">
              %
            </span>
          </div>
          {isNewGardener && (
            <p
              data-testid="walk-reading-moisture-helper"
              className="mt-1 text-[11px] font-bold text-rhozly-on-surface/45 leading-snug"
            >
              Below 30% reads dry; most veg beds are happiest between 40–60%.
            </p>
          )}
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
            <Thermometer size={14} className="text-orange-600" /> Soil temperature
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              placeholder="-50 – 80"
              min={-50}
              max={80}
              step="any"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              data-testid="walk-reading-temp"
              className="flex-1 px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors"
            />
            <span className="text-xs font-black text-rhozly-on-surface/55 min-w-[3rem]">
              °C
            </span>
          </div>
          {isNewGardener && (
            <p
              data-testid="walk-reading-temp-helper"
              className="mt-1 text-[11px] font-bold text-rhozly-on-surface/45 leading-snug"
            >
              Seeds want the soil 10°C+ before sowing; 18–24°C is the sweet
              spot for most summer crops.
            </p>
          )}
        </div>
      </div>

      <div
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
        className="shrink-0 px-3 pt-3 flex items-center gap-2"
      >
        <button
          type="button"
          data-testid="walk-reading-cancel"
          onClick={onClose}
          className="flex-1 min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/15 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/65"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="walk-reading-save"
          onClick={() => void save()}
          disabled={saving || (moisture.trim() === "" && temp.trim() === "")}
          className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
          Save reading
        </button>
      </div>
    </div>
  );
}
