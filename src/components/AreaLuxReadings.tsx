import React, { useState, useEffect, useCallback } from "react";
import { Sun, Plus, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

interface LuxReading {
  id: string;
  lux_value: number;
  recorded_at: string;
  source: "sensor" | "manual" | "plant";
}

interface Props {
  areaId: string;
  homeId: string;
  onLatestChanged: (lux: number) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  sensor: "Sensor",
  manual: "Manual",
  plant: "Plant",
};

const SOURCE_COLOR: Record<string, string> = {
  sensor: "bg-blue-100 text-blue-700",
  manual: "bg-gray-100 text-gray-600",
  plant: "bg-green-100 text-green-700",
};

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AreaLuxReadings({ areaId, homeId, onLatestChanged }: Props) {
  const [readings, setReadings] = useState<LuxReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formLux, setFormLux] = useState("");
  const [formDatetime, setFormDatetime] = useState(() => toLocalDatetimeValue(new Date()));
  const [formError, setFormError] = useState<string | null>(null);

  const fetchReadings = useCallback(async () => {
    const { data } = await supabase
      .from("area_lux_readings")
      .select("id, lux_value, recorded_at, source")
      .eq("area_id", areaId)
      .order("recorded_at", { ascending: false })
      .limit(20);
    setReadings((data ?? []) as LuxReading[]);
    setLoading(false);
  }, [areaId]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  const handleAdd = async () => {
    const luxNum = parseInt(formLux, 10);
    if (isNaN(luxNum) || luxNum < 0 || luxNum > 200000) {
      setFormError("Enter a value between 0 and 200,000");
      return;
    }
    if (!formDatetime) {
      setFormError("Select a date and time");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const recordedAt = new Date(formDatetime).toISOString();
      const { error: insertErr } = await supabase.from("area_lux_readings").insert({
        home_id: homeId,
        area_id: areaId,
        lux_value: luxNum,
        recorded_at: recordedAt,
        source: "manual",
      });
      if (insertErr) throw insertErr;
      // Keep denormalized latest in sync
      await supabase.from("areas").update({ light_intensity_lux: luxNum }).eq("id", areaId);
      onLatestChanged(luxNum);
      setFormLux("");
      setFormDatetime(toLocalDatetimeValue(new Date()));
      toast.success(`Added ${luxNum.toLocaleString()} lux reading`);
      await fetchReadings();
    } catch {
      toast.error("Failed to add reading");
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1.5";
  const inputClass = "w-full p-3 bg-white rounded-xl font-bold text-sm border border-rhozly-outline/20 focus:border-rhozly-primary focus:ring-2 focus:ring-rhozly-primary/20 outline-none";

  return (
    <div data-testid="area-lux-readings" className="space-y-3">
      <label className={labelClass}>
        <Sun size={13} /> Light Readings
      </label>

      {/* Add Reading form */}
      <div data-testid="area-lux-add-form" className="bg-rhozly-surface-low rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Add Reading</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-rhozly-on-surface/40 block mb-1">Lux Value</label>
            <input
              type="number"
              min="0"
              max="200000"
              placeholder="e.g. 15000"
              value={formLux}
              onChange={(e) => { setFormLux(e.target.value); setFormError(null); }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-rhozly-on-surface/40 block mb-1">Date & Time</label>
            <input
              type="datetime-local"
              value={formDatetime}
              onChange={(e) => setFormDatetime(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        {formError && (
          <p className="text-xs font-bold text-red-500">{formError}</p>
        )}
        <button
          onClick={handleAdd}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-rhozly-primary text-white rounded-xl font-black text-xs uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
      </div>

      {/* Readings list */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 justify-center text-rhozly-on-surface/30">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs font-bold">Loading readings…</span>
        </div>
      ) : readings.length === 0 ? (
        <p className="text-xs font-bold text-rhozly-on-surface/30 text-center py-3">
          No readings yet — add one above or use the Light Sensor page.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
          {readings.map((r) => (
            <div
              key={r.id}
              data-testid="area-lux-reading-item"
              className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-rhozly-outline/10"
            >
              <div className="flex items-center gap-2">
                <Sun size={12} className="text-amber-400 shrink-0" />
                <span className="font-black text-sm text-rhozly-on-surface">
                  {r.lux_value.toLocaleString()} lux
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-rhozly-on-surface/40">
                  {new Date(r.recorded_at).toLocaleString(undefined, {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md ${SOURCE_COLOR[r.source] ?? "bg-gray-100 text-gray-600"}`}>
                  {SOURCE_LABEL[r.source] ?? r.source}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
