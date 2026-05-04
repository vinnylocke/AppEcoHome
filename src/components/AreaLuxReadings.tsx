import React, { useState, useEffect, useCallback } from "react";
import { Sun, Plus, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLux, setEditLux] = useState("");
  const [editDatetime, setEditDatetime] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  // After any change, re-sync denormalized latest to the most recent reading
  const syncLatest = async (updatedReadings: LuxReading[]) => {
    const latest = updatedReadings[0];
    const newLux = latest?.lux_value ?? null;
    await supabase.from("areas").update({ light_intensity_lux: newLux }).eq("id", areaId);
    if (newLux !== null) onLatestChanged(newLux);
  };

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
      setFormLux("");
      setFormDatetime(toLocalDatetimeValue(new Date()));
      toast.success(`Added ${luxNum.toLocaleString()} lux reading`);
      await fetchReadings();
      // Sync latest after re-fetch
      const { data: fresh } = await supabase
        .from("area_lux_readings")
        .select("id, lux_value, recorded_at, source")
        .eq("area_id", areaId)
        .order("recorded_at", { ascending: false })
        .limit(1);
      if (fresh?.[0]) {
        await supabase.from("areas").update({ light_intensity_lux: fresh[0].lux_value }).eq("id", areaId);
        onLatestChanged(fresh[0].lux_value);
      }
    } catch {
      toast.error("Failed to add reading");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r: LuxReading) => {
    setEditingId(r.id);
    setEditLux(String(r.lux_value));
    setEditDatetime(toLocalDatetimeValue(new Date(r.recorded_at)));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLux("");
    setEditDatetime("");
  };

  const handleSaveEdit = async (r: LuxReading) => {
    const luxNum = parseInt(editLux, 10);
    if (isNaN(luxNum) || luxNum < 0 || luxNum > 200000) {
      toast.error("Lux must be between 0 and 200,000");
      return;
    }
    if (!editDatetime) {
      toast.error("Date and time are required");
      return;
    }
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from("area_lux_readings")
        .update({ lux_value: luxNum, recorded_at: new Date(editDatetime).toISOString() })
        .eq("id", r.id);
      if (error) throw error;
      toast.success("Reading updated");
      cancelEdit();
      await fetchReadings();
      // Re-fetch sorted list to find true latest
      const { data: fresh } = await supabase
        .from("area_lux_readings")
        .select("id, lux_value, recorded_at, source")
        .eq("area_id", areaId)
        .order("recorded_at", { ascending: false })
        .limit(1);
      if (fresh?.[0]) {
        await supabase.from("areas").update({ light_intensity_lux: fresh[0].lux_value }).eq("id", areaId);
        onLatestChanged(fresh[0].lux_value);
      }
    } catch {
      toast.error("Failed to update reading");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (r: LuxReading) => {
    setDeletingId(r.id);
    try {
      const { error } = await supabase.from("area_lux_readings").delete().eq("id", r.id);
      if (error) throw error;
      toast.success("Reading deleted");
      await fetchReadings();
      // Sync latest after deletion
      const { data: fresh } = await supabase
        .from("area_lux_readings")
        .select("id, lux_value, recorded_at, source")
        .eq("area_id", areaId)
        .order("recorded_at", { ascending: false })
        .limit(1);
      const newLux = fresh?.[0]?.lux_value ?? null;
      await supabase.from("areas").update({ light_intensity_lux: newLux }).eq("id", areaId);
      if (newLux !== null) onLatestChanged(newLux);
    } catch {
      toast.error("Failed to delete reading");
    } finally {
      setDeletingId(null);
    }
  };

  const labelClass = "text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1.5";
  const inputClass = "w-full p-3 bg-white rounded-xl font-bold text-sm border border-rhozly-outline/20 focus:border-rhozly-primary focus:ring-2 focus:ring-rhozly-primary/20 outline-none";
  const editInputClass = "p-1.5 bg-white rounded-lg font-bold text-xs border border-rhozly-outline/20 focus:border-rhozly-primary outline-none w-full";

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
          {readings.map((r) =>
            editingId === r.id ? (
              /* Inline edit row */
              <div
                key={r.id}
                data-testid="area-lux-reading-item"
                className="bg-white rounded-xl px-3 py-2.5 border border-rhozly-primary/30 space-y-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-rhozly-on-surface/40 block mb-0.5">Lux</label>
                    <input
                      type="number"
                      min="0"
                      max="200000"
                      value={editLux}
                      onChange={(e) => setEditLux(e.target.value)}
                      className={editInputClass}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-rhozly-on-surface/40 block mb-0.5">Date & Time</label>
                    <input
                      type="datetime-local"
                      value={editDatetime}
                      onChange={(e) => setEditDatetime(e.target.value)}
                      className={editInputClass}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveEdit(r)}
                    disabled={editSaving}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rhozly-primary text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {editSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={editSaving}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rhozly-surface text-rhozly-on-surface/60 rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all"
                  >
                    <X size={11} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Normal read row */
              <div
                key={r.id}
                data-testid="area-lux-reading-item"
                className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-rhozly-outline/10 group"
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
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(r)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-rhozly-surface text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors"
                      title="Edit reading"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.id}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-rhozly-on-surface/40 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Delete reading"
                    >
                      {deletingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
