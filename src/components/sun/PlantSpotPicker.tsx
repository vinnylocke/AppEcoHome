import React, { useEffect, useRef, useState } from "react";
import { Sprout, Search, ChevronDown, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

export interface PlantSpotOption {
  id: string;
  name: string;
  sunlight: string | null;
  source: "shed" | "manual";
}

interface Props {
  homeId: string;
  value: PlantSpotOption | null;
  onChange: (plant: PlantSpotOption | null) => void;
}

interface ShedPlantRow {
  id: string;
  plant_name: string | null;
  nickname: string | null;
  plants: { sunlight: any } | null;
}

function normaliseSunlight(raw: any): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === "string") return raw;
  return null;
}

export default function PlantSpotPicker({ homeId, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [plants, setPlants] = useState<PlantSpotOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Fetch plants on first open
  useEffect(() => {
    if (!open || plants.length > 0) return;
    setLoading(true);
    supabase
      .from("inventory_items")
      .select("id, plant_name, nickname, plants(sunlight)")
      .eq("home_id", homeId)
      .neq("status", "Archived")
      .limit(200)
      .then(({ data }) => {
        const options: PlantSpotOption[] = ((data ?? []) as unknown as ShedPlantRow[]).map(row => ({
          id: row.id,
          name: row.nickname || row.plant_name || "Unnamed plant",
          sunlight: normaliseSunlight(row.plants?.sunlight),
          source: "shed",
        }));
        // Deduplicate by name so the picker isn't full of 5 "Tomato" instances
        const seen = new Map<string, PlantSpotOption>();
        options.forEach(opt => {
          const key = opt.name.toLowerCase();
          if (!seen.has(key) || (seen.get(key)?.sunlight === null && opt.sunlight !== null)) {
            seen.set(key, opt);
          }
        });
        setPlants(Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      });
  }, [open, homeId, plants.length]);

  const filtered = plants.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div ref={ref} className="relative">
      {value ? (
        <button
          data-testid="sun-tracker-plant-picker-clear"
          onClick={() => onChange(null)}
          className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-amber-500 text-white text-xs font-black border border-amber-600 hover:bg-amber-600 transition-colors"
          title={`Clear plant filter`}
        >
          <Sprout size={13} />
          <span className="max-w-[120px] truncate">{value.name}</span>
          <X size={12} className="opacity-80" />
        </button>
      ) : (
        <button
          data-testid="sun-tracker-plant-picker-open"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-white border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/70 hover:border-amber-300 hover:text-rhozly-on-surface transition-colors"
        >
          <Sprout size={13} />
          Find a spot for…
          <ChevronDown size={12} className="text-rhozly-on-surface/40" />
        </button>
      )}

      {open && !value && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-rhozly-outline/15 z-30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-rhozly-outline/10">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30" />
              <input
                data-testid="sun-tracker-plant-picker-search"
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search your shed…"
                className="w-full pl-8 pr-3 py-2 min-h-[36px] text-xs font-bold bg-rhozly-surface-low rounded-xl border border-transparent focus:border-amber-400 outline-none"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {loading ? (
              <p className="px-3 py-6 text-xs font-bold text-rhozly-on-surface/40 text-center">
                Loading…
              </p>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-xs font-bold text-rhozly-on-surface/50">
                  {plants.length === 0 ? "No plants in your shed yet." : "No matches."}
                </p>
              </div>
            ) : (
              filtered.map(plant => (
                <button
                  key={plant.id}
                  data-testid={`sun-tracker-plant-picker-option-${plant.id}`}
                  onClick={() => { onChange(plant); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold text-rhozly-on-surface hover:bg-rhozly-primary/5 transition-colors min-h-[40px]"
                >
                  <Sprout size={12} className="text-emerald-500 shrink-0" />
                  <span className="flex-1 truncate">{plant.name}</span>
                  {plant.sunlight ? (
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
                      {plant.sunlight.split(/[,/]/)[0].trim()}
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-rhozly-on-surface/30 shrink-0">
                      No sun pref
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
