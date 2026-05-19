import React, { useEffect, useMemo, useState } from "react";
import { History, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { getPlantFamily, getRotationWarning, type PlantFamily } from "../../constants/plantFamilies";

interface PlantHistoryRow {
  id: string;
  plant_name: string;
  nickname: string | null;
  status: string;
  planted_at: string | null;
  created_at: string;
}

interface Props {
  areaId: string;
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear();
}

export default function ShapeHistory({ areaId }: Props) {
  const [rows, setRows] = useState<PlantHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("inventory_items")
          .select("id, plant_name, nickname, status, planted_at, created_at")
          .eq("area_id", areaId)
          .order("planted_at", { ascending: false, nullsFirst: false });
        if (error) throw error;
        if (!cancelled) setRows(data ?? []);
      } catch (err) {
        Logger.error("Failed to load shape history", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [areaId]);

  // Hooks must run in the same order every render — keep these BEFORE any early return.
  const byYear = useMemo(() => {
    const m = new Map<number | "Unknown", PlantHistoryRow[]>();
    for (const r of rows) {
      const y = yearOf(r.planted_at) ?? yearOf(r.created_at) ?? "Unknown";
      if (!m.has(y)) m.set(y, []);
      m.get(y)!.push(r);
    }
    return m;
  }, [rows]);

  const rotationWarnings = useMemo(() => {
    const now = new Date().getFullYear();
    const thisYear = byYear.get(now) ?? [];
    const lastYear = byYear.get(now - 1) ?? [];
    if (thisYear.length === 0 || lastYear.length === 0) return [] as { family: PlantFamily; message: string }[];
    const lastYearFamilies = new Set(lastYear.map(r => getPlantFamily(r.plant_name)));
    const overlaps = new Set<PlantFamily>();
    for (const r of thisYear) {
      const fam = getPlantFamily(r.plant_name);
      if (lastYearFamilies.has(fam) && fam !== "Other") overlaps.add(fam);
    }
    return Array.from(overlaps)
      .map(f => ({ family: f, message: getRotationWarning(f) ?? `${f} planted here last year — consider rotating.` }));
  }, [byYear]);

  const yearKeys = useMemo(() => Array.from(byYear.keys()).sort((a, b) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return (b as number) - (a as number);
  }), [byYear]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Loader2 size={14} className="animate-spin text-rhozly-on-surface/30" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-[10px] font-bold text-rhozly-on-surface/40 text-center py-2">
        No planting history yet
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="shape-history">
      <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest flex items-center gap-1.5">
        <History size={11} /> Planting history
      </p>
      {rotationWarnings.length > 0 && (
        <div data-testid="shape-rotation-warning" className="space-y-1.5">
          {rotationWarnings.map(w => (
            <div key={w.family} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle size={12} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] font-bold text-amber-800 leading-snug">{w.message}</p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        {yearKeys.map((year) => (
          <div key={String(year)} className="bg-rhozly-bg rounded-xl px-3 py-2 border border-rhozly-outline/15">
            <p className="text-[10px] font-black text-rhozly-on-surface/60 uppercase tracking-widest mb-1">
              {year}
            </p>
            <div className="space-y-0.5">
              {byYear.get(year)!.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center gap-1.5 text-[11px] font-bold text-rhozly-on-surface/70">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    r.status === "Planted" ? "bg-emerald-500" : "bg-rhozly-on-surface/30"
                  }`} />
                  <span className="flex-1 truncate">{r.nickname ?? r.plant_name}</span>
                  <span className="text-[9px] font-black text-rhozly-on-surface/40 uppercase tracking-wider">{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
