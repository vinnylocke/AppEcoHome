import React, { useState, useEffect } from "react";
import { Trash2, Link, Settings, X, RotateCcw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

export type ShapeData = {
  id: string;
  layout_id: string;
  area_id: string | null;
  shape_type: "rect" | "circle" | "ellipse" | "polygon" | "path";
  label: string | null;
  color: string;
  x_m: number;
  y_m: number;
  width_m: number | null;
  height_m: number | null;
  radius_m: number | null;
  points: { x: number; y: number }[] | null;
  rotation: number;
  z_index: number;
  dashed: boolean;
};

const SWATCHES = ["#4ade80", "#a3e635", "#bfdbfe", "#7dd3fc", "#fbbf24", "#f87171", "#d6d3d1", "#a8a29e"];

interface Area { id: string; name: string; location_id: string; }

interface Props {
  shape: ShapeData;
  homeId: string;
  onChange: (updated: Partial<ShapeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function GardenShapeProperties({ shape, homeId, onChange, onDelete, onClose }: Props) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaSearch, setAreaSearch] = useState("");
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  useEffect(() => {
    fetchAreas();
  }, [homeId]);

  const fetchAreas = async () => {
    try {
      const { data } = await supabase
        .from("areas")
        .select("id, name, location_id")
        .in("location_id", (
          await supabase.from("locations").select("id").eq("home_id", homeId)
        ).data?.map((l: any) => l.id) ?? [])
        .order("name");
      setAreas(data ?? []);
    } catch (err) {
      Logger.error("Failed to fetch areas for shape properties", err);
    }
  };

  const linkedArea = areas.find(a => a.id === shape.area_id);
  const filteredAreas = areas.filter(a => a.name.toLowerCase().includes(areaSearch.toLowerCase()));

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">{label}</p>
      {children}
    </div>
  );

  return (
    <div className="w-56 shrink-0 bg-white border-l border-rhozly-outline/20 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-xs font-black text-rhozly-on-surface uppercase tracking-widest">Properties</p>
        <button onClick={onClose} className="p-1 rounded-lg text-rhozly-on-surface/30 hover:text-rhozly-on-surface">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-4">
        {/* Label */}
        {field("Label",
          <input
            data-testid="shape-label-input"
            type="text"
            value={shape.label ?? ""}
            onChange={e => onChange({ label: e.target.value || null })}
            placeholder={shape.shape_type}
            className="w-full bg-rhozly-bg rounded-xl px-3 py-2 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
          />
        )}

        {/* Colour */}
        {field("Colour",
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                className={`w-6 h-6 rounded-lg border-2 transition-transform active:scale-90 ${shape.color === c ? "border-rhozly-on-surface scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={shape.color}
              onChange={e => onChange({ color: e.target.value })}
              className="w-6 h-6 rounded-lg border border-rhozly-outline/20 cursor-pointer overflow-hidden"
              title="Custom colour"
            />
          </div>
        )}

        {/* Dimensions */}
        {(shape.shape_type === "rect" || shape.shape_type === "ellipse" || shape.shape_type === "path") && field("Size (metres)",
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-[9px] font-bold text-rhozly-on-surface/40 mb-0.5">W</p>
              <input
                data-testid="shape-width-input"
                type="number" min="0.1" step="0.1"
                value={shape.width_m ?? ""}
                onChange={e => onChange({ width_m: parseFloat(e.target.value) || null })}
                className="w-full bg-rhozly-bg rounded-xl px-2 py-2 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
              />
            </div>
            <div className="flex-1">
              <p className="text-[9px] font-bold text-rhozly-on-surface/40 mb-0.5">H</p>
              <input
                data-testid="shape-height-input"
                type="number" min="0.1" step="0.1"
                value={shape.height_m ?? ""}
                onChange={e => onChange({ height_m: parseFloat(e.target.value) || null })}
                className="w-full bg-rhozly-bg rounded-xl px-2 py-2 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
              />
            </div>
          </div>
        )}

        {shape.shape_type === "circle" && field("Radius (m)",
          <input
            data-testid="shape-radius-input"
            type="number" min="0.05" step="0.05"
            value={shape.radius_m ?? ""}
            onChange={e => onChange({ radius_m: parseFloat(e.target.value) || null })}
            className="w-full bg-rhozly-bg rounded-xl px-3 py-2 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
          />
        )}

        {/* Rotation */}
        {field("Rotation",
          <div className="flex items-center gap-2">
            <input
              data-testid="shape-rotation-input"
              type="number" min="-360" max="360" step="5"
              value={Math.round(shape.rotation)}
              onChange={e => onChange({ rotation: parseFloat(e.target.value) || 0 })}
              className="flex-1 bg-rhozly-bg rounded-xl px-3 py-2 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
            />
            <span className="text-xs font-bold text-rhozly-on-surface/40">°</span>
            <button
              onClick={() => onChange({ rotation: 0 })}
              className="p-1.5 rounded-lg text-rhozly-on-surface/30 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
              title="Reset rotation"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        )}

        {/* Linked area */}
        {field("Linked Area",
          <div className="space-y-1.5">
            {linkedArea ? (
              <div className="flex items-center gap-2 bg-rhozly-primary/10 rounded-xl px-3 py-2">
                <Link size={12} className="text-rhozly-primary shrink-0" />
                <span className="text-xs font-black text-rhozly-primary truncate">{linkedArea.name}</span>
                <button onClick={() => onChange({ area_id: null })} className="ml-auto text-rhozly-primary/60 hover:text-rhozly-primary">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                data-testid="link-area-btn"
                onClick={() => setShowAreaPicker(v => !v)}
                className="w-full flex items-center gap-2 bg-rhozly-bg rounded-xl px-3 py-2 border border-rhozly-outline/20 text-xs font-bold text-rhozly-on-surface/50 hover:border-rhozly-primary transition-colors"
              >
                <Link size={12} /> Link to area…
              </button>
            )}

            {showAreaPicker && (
              <div className="bg-rhozly-bg rounded-xl border border-rhozly-outline/20 overflow-hidden">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search areas…"
                  value={areaSearch}
                  onChange={e => setAreaSearch(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold text-rhozly-on-surface outline-none border-b border-rhozly-outline/20 bg-transparent"
                />
                <div className="max-h-32 overflow-y-auto">
                  {filteredAreas.map(a => (
                    <button
                      key={a.id}
                      onClick={() => { onChange({ area_id: a.id, label: shape.label ?? a.name }); setShowAreaPicker(false); setAreaSearch(""); }}
                      className="w-full text-left px-3 py-2 text-xs font-bold text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
                    >
                      {a.name}
                    </button>
                  ))}
                  {filteredAreas.length === 0 && (
                    <p className="px-3 py-2 text-xs font-bold text-rhozly-on-surface/30">No areas found</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Delete */}
        <div className="pt-2 border-t border-rhozly-outline/10">
          <button
            data-testid="delete-shape-btn"
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-500 text-xs font-black hover:bg-red-50 transition-colors"
          >
            <Trash2 size={13} /> Delete shape
          </button>
        </div>
      </div>
    </div>
  );
}
