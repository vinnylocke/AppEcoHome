import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Droplets, Loader2, Thermometer, X, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../../lib/errorHandler";
import { usePersona } from "../../hooks/usePersona";
import { supabase } from "../../lib/supabase";
import { IconSoilPH, IconNutrients } from "../../constants/icons";
import {
  logManualReading,
  validateManualReading,
} from "../../services/areaReadingsService";
import {
  buildBedProfilePatch,
  bedProfileHasChanges,
  validateBedProfile,
  type BedProfileCurrent,
} from "../../lib/walkBedProfile";
import {
  NUTRIENT_SOURCE_OPTIONS,
  WATER_MOVEMENT_OPTIONS,
} from "../../constants/areaProfileOptions";

// RHO-17 Phase 2 — manual soil-reading capture from an area card in the
// Garden Walk. A thin walk-styled sheet over the EXISTING manual write
// path: areaReadingsService.logManualReading → area_moisture_readings /
// area_temp_readings / area_ec_readings with source='manual'. recordedAt
// is omitted so the reading is stamped "now"; DB triggers bump
// areas.latest_soil_* so the Area details Readings tab, drydown profiles
// and the AI Area Coach pick it up for free. EC posts as calibrated
// µS/cm (a human typed it off a handheld meter); the raw-ADC
// discriminator + backdating stay in the full LogReadingModal.
//
// 2026-07-18 — the sheet also carries a collapsed "Bed profile" section
// exposing the area's Advanced-settings quartet (medium pH, peak light,
// water movement, nutrient source). Prefilled from `areas`; saving
// applies only the CHANGED fields (src/lib/walkBedProfile.ts diff) and a
// new peak-light value additionally logs a manual area_lux_readings row,
// mirroring AreaLuxReadings so Light Sensor history stays coherent.
// These fields ground the AI Area Coach + Garden AI chat.

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
      return "Enter a reading or change a bed-profile field before saving.";
    case "moisture_out_of_range":
      return "Moisture must be between 0 and 100%.";
    case "temp_out_of_range":
      return "Soil temperature must be between -50 and 80°C.";
    case "ec_out_of_range":
      return "EC must be between 0 and 100,000 µS/cm.";
    case "ph_out_of_range":
      return "pH must be between 0 and 14.";
    case "lux_out_of_range":
      return "Peak light must be a positive lux value.";
    default:
      return "Couldn't save the reading — try again.";
  }
}

const inputClass =
  "flex-1 px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors";
const labelClass =
  "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5";
const helperClass =
  "mt-1 text-[11px] font-bold text-rhozly-on-surface/45 leading-snug";

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
  const [ec, setEc] = useState("");
  const [saving, setSaving] = useState(false);
  // Guards the readings insert against a partial-failure retry: if the
  // readings committed but the profile update then failed, tapping Save
  // again must NOT re-post the readings (append-only tables — a double
  // post would skew the drydown/EC history the AI reads). The profile
  // writes need no guard: areas.update is idempotent for the same diff
  // and the lux insert is the last operation.
  const readingsSavedRef = useRef(false);

  // Bed profile — collapsed by default; prefilled from the area row on
  // open so the gardener sees what's currently set and adjusts.
  const [profileOpen, setProfileOpen] = useState(false);
  const [current, setCurrent] = useState<BedProfileCurrent | null>(null);
  const [ph, setPh] = useState("");
  const [lux, setLux] = useState("");
  const [waterMovement, setWaterMovement] = useState("");
  const [nutrientSource, setNutrientSource] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("areas")
      .select("medium_ph, light_intensity_lux, water_movement, nutrient_source")
      .eq("id", areaId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row: BedProfileCurrent = {
          medium_ph: data.medium_ph ?? null,
          light_intensity_lux: data.light_intensity_lux ?? null,
          water_movement: data.water_movement ?? null,
          nutrient_source: data.nutrient_source ?? null,
        };
        setCurrent(row);
        setPh(row.medium_ph != null ? String(row.medium_ph) : "");
        setLux(row.light_intensity_lux != null ? String(row.light_intensity_lux) : "");
        setWaterMovement(row.water_movement ?? "");
        setNutrientSource(row.nutrient_source ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, [areaId]);

  const profileDiff = current
    ? buildBedProfilePatch(current, { ph, lux, waterMovement, nutrientSource })
    : null;
  const hasReading =
    moisture.trim() !== "" || temp.trim() !== "" || ec.trim() !== "";
  const hasProfileChange = profileDiff !== null && bedProfileHasChanges(profileDiff);

  const save = async () => {
    const moisturePct = moisture.trim() === "" ? undefined : Number(moisture);
    const tempC = temp.trim() === "" ? undefined : Number(temp);
    const ecValue = ec.trim() === "" ? undefined : Number(ec);

    if (hasReading) {
      const validation = validateManualReading({ homeId, areaId, moisturePct, tempC, ec: ecValue });
      if (validation !== null) {
        toast.error(humanise(validation));
        return;
      }
    }
    if (hasProfileChange) {
      const profileError = validateBedProfile({ ph, lux, waterMovement, nutrientSource });
      if (profileError !== null) {
        toast.error(humanise(profileError));
        return;
      }
    }
    if (!hasReading && !hasProfileChange) {
      toast.error(humanise("nothing_entered"));
      return;
    }

    setSaving(true);
    try {
      if (hasReading && !readingsSavedRef.current) {
        // recordedAt omitted → stamped now inside logManualReading. EC from
        // a handheld meter reads calibrated µS/cm (the service default).
        await logManualReading({ homeId, areaId, moisturePct, tempC, ec: ecValue });
        readingsSavedRef.current = true;
      }
      if (hasProfileChange && profileDiff) {
        const { error: patchErr } = await supabase
          .from("areas")
          .update(profileDiff.patch)
          .eq("id", areaId);
        if (patchErr) throw patchErr;
        if (profileDiff.luxReading !== null) {
          // Mirror AreaLuxReadings: a new peak-light value is also a manual
          // lux reading so the Light Sensor history stays coherent.
          const { error: luxErr } = await supabase.from("area_lux_readings").insert({
            home_id: homeId,
            area_id: areaId,
            lux_value: profileDiff.luxReading,
            recorded_at: new Date().toISOString(),
            source: "manual",
          });
          if (luxErr) throw luxErr;
        }
      }
      toast.success(
        hasReading && hasProfileChange
          ? `Reading + bed profile saved for ${areaName}`
          : hasProfileChange
            ? `Bed profile updated for ${areaName}`
            : `Reading logged for ${areaName}`,
      );
      onLogged();
      onClose();
    } catch (err: unknown) {
      Logger.error("WalkReadingSheet save failed", err, { homeId, areaId });
      // If the readings already committed, the failure was the profile
      // update — say so instead of implying nothing saved.
      toast.error(
        readingsSavedRef.current && hasProfileChange
          ? "Reading saved, but the bed profile update failed — tap Save to retry it."
          : err instanceof Error ? humanise(err.message) : humanise("unknown"),
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
            ? "Fill in what you measured — any field on its own is fine. Readings are stamped with right now."
            : "Any field on its own is fine — readings stamped now."}
        </p>

        <div>
          <label className={labelClass}>
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
              className={inputClass}
            />
            <span className="text-xs font-black text-rhozly-on-surface/55 min-w-[3rem]">
              %
            </span>
          </div>
          {isNewGardener && (
            <p
              data-testid="walk-reading-moisture-helper"
              className={helperClass}
            >
              Below 30% reads dry; most veg beds are happiest between 40–60%.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>
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
              className={inputClass}
            />
            <span className="text-xs font-black text-rhozly-on-surface/55 min-w-[3rem]">
              °C
            </span>
          </div>
          {isNewGardener && (
            <p
              data-testid="walk-reading-temp-helper"
              className={helperClass}
            >
              Seeds want the soil 10°C+ before sowing; 18–24°C is the sweet
              spot for most summer crops.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>
            <Zap size={14} className="text-amber-600" /> Soil EC
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 800"
              min={0}
              max={100000}
              step="any"
              value={ec}
              onChange={(e) => setEc(e.target.value)}
              data-testid="walk-reading-ec"
              className={inputClass}
            />
            <span className="text-xs font-black text-rhozly-on-surface/55 min-w-[3rem]">
              µS/cm
            </span>
          </div>
          {isNewGardener && (
            <p
              data-testid="walk-reading-ec-helper"
              className={helperClass}
            >
              Most veg beds read 200–1200 µS/cm; higher means saltier soil.
            </p>
          )}
        </div>

        {/* Bed profile — the area's Advanced-settings quartet, editable
            in-walk. Collapsed by default to keep quick capture quick. */}
        <div className="rounded-2xl bg-white/70 border border-rhozly-outline/15">
          <button
            type="button"
            data-testid="walk-bed-profile-toggle"
            onClick={() => setProfileOpen((o) => !o)}
            className="w-full min-h-[48px] px-3 flex items-center justify-between"
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
              Bed profile{hasProfileChange ? " · edited" : ""}
            </span>
            {profileOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {/* Fields render only once the prefill has landed — otherwise a
              slow fetch could resolve mid-typing and clobber user input. */}
          {profileOpen && !current && (
            <div className="px-3 pb-4 flex justify-center">
              <Loader2 size={16} className="animate-spin text-rhozly-on-surface/40" />
            </div>
          )}
          {profileOpen && current && (
            <div className="px-3 pb-4 space-y-4">
              {isNewGardener && (
                <p className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug">
                  These describe the bed itself and stay until you change them
                  — they help the AI give better advice for this spot.
                </p>
              )}

              <div>
                <label className={labelClass}>
                  <IconSoilPH size={14} /> Medium pH
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 6.5"
                  min={0}
                  max={14}
                  step={0.1}
                  value={ph}
                  onChange={(e) => setPh(e.target.value)}
                  data-testid="walk-profile-ph"
                  className={`${inputClass} w-full`}
                />
                {isNewGardener && (
                  <p className={helperClass}>
                    6.0–7.0 suits most plants; below 6 is acidic, above 7 alkaline.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  <Zap size={14} className="text-yellow-600" /> Peak light (lux)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 25000"
                  min={0}
                  step="any"
                  value={lux}
                  onChange={(e) => setLux(e.target.value)}
                  data-testid="walk-profile-lux"
                  className={`${inputClass} w-full`}
                />
                {isNewGardener && (
                  <p className={helperClass}>
                    Under 10k lux is shade; 45k+ is full sun. The Light Sensor
                    tool can measure this for you.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  <Droplets size={14} className="text-sky-600" /> Water movement
                </label>
                <select
                  value={waterMovement}
                  onChange={(e) => setWaterMovement(e.target.value)}
                  data-testid="walk-profile-water"
                  className={`${inputClass} w-full appearance-none`}
                >
                  <option value="">Not set</option>
                  {WATER_MOVEMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  <IconNutrients size={14} /> Nutrient source
                </label>
                <select
                  value={nutrientSource}
                  onChange={(e) => setNutrientSource(e.target.value)}
                  data-testid="walk-profile-nutrient"
                  className={`${inputClass} w-full appearance-none`}
                >
                  <option value="">Not set</option>
                  {NUTRIENT_SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
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
          disabled={saving || (!hasReading && !hasProfileChange)}
          className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
          Save
        </button>
      </div>
    </div>
  );
}
