import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Droplets, Thermometer, Zap, Loader2, Check } from "lucide-react";
import toast from "react-hot-toast";
import {
  logManualReading,
  validateManualReading,
} from "../../services/areaReadingsService";
import type { EcSource } from "../../services/areaSensorsService";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface Props {
  homeId: string;
  areaId: string;
  areaName: string;
  onClose: () => void;
  /** Called after a successful write so the parent can re-fetch the
   *  area panel state. */
  onLogged: () => void;
}

/**
 * Phase 2 — manual area-metric entry.
 *
 * Single form. The user fills in whichever metrics they have (USB
 * probe, calibrated meter, eyeballed moisture, etc.) — empty fields
 * are skipped. The default timestamp is "now" with a datetime-local
 * picker for backdating.
 */
export default function LogReadingModal({
  homeId,
  areaId,
  areaName,
  onClose,
  onLogged,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [moisture, setMoisture] = useState("");
  const [temp, setTemp] = useState("");
  const [ec, setEc] = useState("");
  const [ecSource, setEcSource] = useState<EcSource>("calibrated_us_cm");
  const [recordedAtLocal, setRecordedAtLocal] = useState<string>(localNowString);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const moisturePct = moisture.trim() === "" ? undefined : Number(moisture);
    const tempC = temp.trim() === "" ? undefined : Number(temp);
    const ecValue = ec.trim() === "" ? undefined : Number(ec);

    const input = {
      homeId,
      areaId,
      moisturePct,
      tempC,
      ec: ecValue,
      ecSource: ecValue !== undefined ? ecSource : undefined,
      recordedAt: localToIso(recordedAtLocal),
    };

    const validation = validateManualReading(input);
    if (validation !== null) {
      toast.error(humanise(validation));
      return;
    }

    setSaving(true);
    try {
      const result = await logManualReading(input);
      toast.success(
        `Logged ${result.inserted_metrics
          .map((m) => (m === "moisture" ? "moisture" : m === "temp" ? "temp" : "EC"))
          .join(" + ")} for ${areaName}`,
      );
      onLogged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? humanise(err.message) : "Could not save reading");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      data-testid="log-reading-modal"
      className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-reading-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rhozly-outline/10">
          <div className="min-w-0">
            <h2 id="log-reading-title" className="font-display font-black text-lg text-rhozly-on-surface truncate">
              Log a reading
            </h2>
            <p className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug">
              Manual entry for {areaName} — fill in only the metrics you have.
            </p>
          </div>
          <button
            type="button"
            data-testid="log-reading-close"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Moisture */}
          <Field
            icon={<Droplets size={14} className="text-blue-600" />}
            label="Moisture"
            unit="%"
            placeholder="0 – 100"
            min={0}
            max={100}
            step="any"
            value={moisture}
            onChange={setMoisture}
            testId="log-moisture"
          />

          {/* Temp */}
          <Field
            icon={<Thermometer size={14} className="text-orange-600" />}
            label="Soil temperature"
            unit="°C"
            placeholder="-50 – 80"
            min={-50}
            max={80}
            step="any"
            value={temp}
            onChange={setTemp}
            testId="log-temp"
          />

          {/* EC */}
          <div>
            <Field
              icon={<Zap size={14} className="text-amber-600" />}
              label="EC"
              unit={ecSource === "calibrated_us_cm" ? "µS/cm" : "raw"}
              placeholder="0 – 100000"
              min={0}
              max={100000}
              step="any"
              value={ec}
              onChange={setEc}
              testId="log-ec"
            />
            {ec.trim() !== "" && (
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  data-testid="log-ec-source-calibrated"
                  onClick={() => setEcSource("calibrated_us_cm")}
                  className={`flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl border-2 transition-all ${
                    ecSource === "calibrated_us_cm"
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-rhozly-outline/15 text-rhozly-on-surface/50 hover:border-amber-300"
                  }`}
                >
                  Calibrated µS/cm
                </button>
                <button
                  type="button"
                  data-testid="log-ec-source-raw"
                  onClick={() => setEcSource("raw_adc")}
                  className={`flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl border-2 transition-all ${
                    ecSource === "raw_adc"
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-rhozly-outline/15 text-rhozly-on-surface/50 hover:border-amber-300"
                  }`}
                >
                  Raw ADC
                </button>
              </div>
            )}
          </div>

          {/* Timestamp */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
              When
            </label>
            <input
              type="datetime-local"
              value={recordedAtLocal}
              onChange={(e) => setRecordedAtLocal(e.target.value)}
              data-testid="log-recorded-at"
              className="w-full px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors"
            />
            <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-1 leading-snug">
              Defaults to now. Backdate when you're logging a reading from earlier.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-rhozly-outline/10 px-5 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            data-testid="log-reading-cancel"
            onClick={onClose}
            className="px-4 py-2.5 min-h-[44px] rounded-2xl text-sm font-bold text-rhozly-on-surface/55 hover:text-rhozly-on-surface transition"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="log-reading-save"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 disabled:opacity-40 transition shadow-sm"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Saving…</>
            ) : (
              <><Check size={14} /> Log reading</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Building blocks ──────────────────────────────────────────────────────

function Field({
  icon,
  label,
  unit,
  placeholder,
  min,
  max,
  step,
  value,
  onChange,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  unit: string;
  placeholder: string;
  min?: number;
  max?: number;
  step?: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
        {icon} {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          data-testid={testId}
          className="flex-1 px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors"
        />
        <span className="text-xs font-black text-rhozly-on-surface/55 min-w-[3rem]">{unit}</span>
      </div>
    </div>
  );
}

function humanise(code: string): string {
  switch (code) {
    case "nothing_entered":
      return "Enter at least one metric before saving.";
    case "moisture_out_of_range":
      return "Moisture must be between 0 and 100%.";
    case "temp_out_of_range":
      return "Soil temperature must be between -50 and 80°C.";
    case "ec_out_of_range":
      return "EC must be between 0 and 100000.";
    case "ec_source_invalid":
      return "EC source must be calibrated µS/cm or raw ADC.";
    default:
      return code;
  }
}

function localNowString(): string {
  const d = new Date();
  // Datetime-local input wants YYYY-MM-DDTHH:MM in local time.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  // The input strips seconds + timezone; reconstruct as a local Date
  // and let toISOString() handle the UTC conversion.
  if (!local) return new Date().toISOString();
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}
