import React, { useState, useEffect } from "react";
import { X, Loader2, ListPlus, Leaf } from "lucide-react";
import { IconPlantDB, IconAI } from "../constants/icons";
import { PerenualService } from "../lib/perenualService";
import { PlantDoctorService } from "../services/plantDoctorService";

interface PlantResult {
  ai: string[];
  api: any[];
  loading: boolean;
}

type Selection = { type: "api" | "ai"; data: any };

interface Props {
  plants: string[];
  isPremium: boolean;
  isAiEnabled: boolean;
  onConfirm: (items: { type: "api" | "ai"; data: any }[]) => void;
  onClose: () => void;
}

export default function PlantSourcePicker({
  plants,
  isPremium,
  isAiEnabled,
  onConfirm,
  onClose,
}: Props) {
  const [results, setResults] = useState<Record<string, PlantResult>>(() =>
    Object.fromEntries(
      plants.map((p) => [p, { ai: [], api: [], loading: true }]),
    ),
  );
  const [selections, setSelections] = useState<Record<string, Selection | null>>({});

  useEffect(() => {
    plants.forEach(async (name) => {
      const [ai, api] = await Promise.all([
        isAiEnabled
          ? PlantDoctorService.searchPlantsText(name)
              .then((d) => (d.matches || []).slice(0, 3))
              .catch(() => [] as string[])
          : ([] as string[]),
        isPremium
          ? PerenualService.searchPlants(name)
              .then((d) => (d || []).slice(0, 3))
              .catch(() => [] as any[])
          : ([] as any[]),
      ]);

      setResults((prev) => ({ ...prev, [name]: { ai, api, loading: false } }));

      // Auto-select best available result — AI first, then Perenual
      const auto: Selection | null =
        ai.length > 0
          ? { type: "ai", data: ai[0] }
          : api.length > 0
            ? { type: "api", data: api[0] }
            : null;

      if (auto) {
        setSelections((prev) => ({ ...prev, [name]: auto }));
      }
    });
  }, []);

  const select = (plantName: string, s: Selection) => {
    setSelections((prev) => ({ ...prev, [plantName]: s }));
  };

  const isSelected = (plantName: string, s: Selection) => {
    const cur = selections[plantName];
    if (!cur || cur.type !== s.type) return false;
    if (s.type === "ai") return cur.data === s.data;
    return String(cur.data?.id) === String(s.data?.id);
  };

  const selectedItems = Object.values(selections).filter(Boolean) as Selection[];
  const allLoaded = Object.values(results).every((r) => !r.loading);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
      <div className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden">

        {/* Header */}
        <div className="p-8 pb-4 shrink-0 flex justify-between items-start border-b border-rhozly-outline/10">
          <div>
            <h3 className="text-2xl font-black flex items-center gap-3">
              <ListPlus className="text-rhozly-primary" /> Add to Shed
            </h3>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              Pick a source for each plant
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        {/* Plant cards */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
          {plants.map((name) => {
            const r = results[name];
            const hasResults = r && (r.ai.length > 0 || r.api.length > 0);

            return (
              <div
                key={name}
                className="bg-white border border-rhozly-outline/10 rounded-2xl overflow-hidden shadow-sm"
              >
                {/* Plant name header */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-rhozly-outline/5 bg-rhozly-surface-low/40">
                  <div className="flex items-center gap-2">
                    <Leaf size={14} className="text-rhozly-primary" />
                    <span className="font-black text-sm text-rhozly-on-surface">{name}</span>
                  </div>
                  {r?.loading && (
                    <div className="flex items-center gap-1.5 text-rhozly-on-surface/40">
                      <Loader2 size={12} className="animate-spin" />
                      <span className="text-[10px] font-bold">Searching…</span>
                    </div>
                  )}
                  {!r?.loading && selections[name] && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary/10 px-2 py-0.5 rounded-full">
                      Selected
                    </span>
                  )}
                </div>

                {r?.loading ? (
                  <div className="p-6 flex items-center justify-center gap-2 text-rhozly-on-surface/30">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-xs font-bold">Searching AI and Perenual…</span>
                  </div>
                ) : !hasResults ? (
                  <div className="p-4 text-center text-xs font-bold text-rhozly-on-surface/40">
                    No results found — you can add this plant manually from the Shed.
                  </div>
                ) : (
                  <div className="p-3 space-y-3">

                    {/* AI results */}
                    {isAiEnabled && r.ai.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80 mb-1.5 px-1">
                          AI Suggestions
                        </p>
                        <div className="space-y-1.5">
                          {r.ai.map((match) => {
                            const sel: Selection = { type: "ai", data: match };
                            const active = isSelected(name, sel);
                            return (
                              <button
                                key={match}
                                onClick={() => select(name, sel)}
                                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${active ? "border-amber-400 bg-amber-50" : "border-transparent hover:border-amber-200 hover:bg-amber-50/40"}`}
                              >
                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${active ? "border-amber-500 bg-amber-500" : "border-rhozly-outline"}`}>
                                  {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 shrink-0 flex items-center justify-center">
                                  <IconAI size={14} className="text-amber-500" />
                                </div>
                                <span className="text-xs font-bold text-rhozly-on-surface leading-tight flex-1 min-w-0 truncate">
                                  {match}
                                </span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">
                                  AI
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Perenual results */}
                    {isPremium && r.api.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-primary/80 mb-1.5 px-1">
                          Perenual Database
                        </p>
                        <div className="space-y-1.5">
                          {r.api.map((plant: any) => {
                            const sel: Selection = { type: "api", data: plant };
                            const active = isSelected(name, sel);
                            const thumb =
                              plant.default_image?.thumbnail &&
                              !plant.default_image.thumbnail.includes("upgrade_access")
                                ? plant.default_image.thumbnail
                                : null;
                            return (
                              <button
                                key={plant.id}
                                onClick={() => select(name, sel)}
                                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${active ? "border-rhozly-primary bg-rhozly-primary/5" : "border-transparent hover:border-rhozly-primary/20 hover:bg-rhozly-primary/5"}`}
                              >
                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${active ? "border-rhozly-primary bg-rhozly-primary" : "border-rhozly-outline"}`}>
                                  {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div className="w-8 h-8 rounded-lg bg-rhozly-primary/5 shrink-0 overflow-hidden flex items-center justify-center">
                                  {thumb ? (
                                    <img src={thumb} alt={plant.common_name} className="w-full h-full object-cover" />
                                  ) : (
                                    <IconPlantDB size={14} className="text-rhozly-primary/40" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-bold text-rhozly-on-surface block truncate leading-tight">
                                    {plant.common_name}
                                  </span>
                                  {plant.scientific_name?.[0] && (
                                    <span className="text-[9px] italic text-rhozly-on-surface/50 block truncate">
                                      {plant.scientific_name[0]}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[8px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                                  DB
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 p-6 border-t border-rhozly-outline/10 bg-white">
          <button
            onClick={() => onConfirm(selectedItems)}
            disabled={selectedItems.length === 0 || !allLoaded}
            className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black text-sm shadow-lg hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {!allLoaded ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Searching…
              </>
            ) : (
              <>
                <ListPlus size={18} />
                {selectedItems.length === 0
                  ? "Select at least one plant"
                  : `Review ${selectedItems.length} Plant${selectedItems.length !== 1 ? "s" : ""}`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
