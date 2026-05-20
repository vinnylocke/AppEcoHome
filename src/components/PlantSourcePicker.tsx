import React, { useState, useEffect, useRef } from "react";
import { X, Loader2, ListPlus, Leaf, Info, ChevronUp, AlertCircle } from "lucide-react";
import { IconPlantDB, IconAI } from "../constants/icons";
import { PerenualService } from "../lib/perenualService";
import { VerdantlyService } from "../lib/verdantlyService";
import { PlantDoctorService, type CatalogueHit } from "../services/plantDoctorService";
import { getProviderPlantDetails, careGuideToPlantDetails } from "../lib/plantProvider";
import type { PlantDetails } from "../lib/verdantlyUtils";
import PlantInfoPanel from "./PlantInfoPanel";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface PlantResult {
  ai: string[];
  api: any[];
  verdantly: any[];
  /** Wave 3 — sparse map keyed by AI match string for matches that exist in the
   * global catalogue or as the home's fork. Drives "In catalogue" pill. */
  aiHits?: Record<string, CatalogueHit>;
  verdantlyFailed?: boolean;
  loading: boolean;
}

type Selection = { type: "api" | "ai" | "verdantly"; data: any };

interface Props {
  plants: string[];
  isPremium: boolean;
  isAiEnabled: boolean;
  homeId?: string;
  onConfirm: (items: { type: "api" | "ai" | "verdantly"; data: any }[]) => void;
  onClose: () => void;
}

export default function PlantSourcePicker({
  plants,
  isPremium,
  isAiEnabled,
  homeId,
  onConfirm,
  onClose,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [results, setResults] = useState<Record<string, PlantResult>>(() =>
    Object.fromEntries(
      plants.map((p) => [p, { ai: [], api: [], verdantly: [], loading: true }]),
    ),
  );
  const [selections, setSelections] = useState<Record<string, Selection | null>>({});
  const [detailsCache, setDetailsCache] = useState<Map<string, PlantDetails>>(new Map());
  const [loadingDetailsIds, setLoadingDetailsIds] = useState<Set<string>>(new Set());
  const fetchingDetailsRef = useRef<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDetails = async (id: string, plantObj?: any) => {
    if (detailsCache.has(id) || fetchingDetailsRef.current.has(id)) return;
    fetchingDetailsRef.current.add(id);
    setLoadingDetailsIds((prev) => new Set(prev).add(id));
    try {
      let details: PlantDetails;
      if (plantObj) {
        details = await getProviderPlantDetails({
          source: plantObj._provider === "verdantly" ? "verdantly" : "api",
          perenual_id:  plantObj._provider !== "verdantly" ? (plantObj.perenual_id ?? plantObj.id) : null,
          verdantly_id: plantObj._provider === "verdantly" ? (plantObj.verdantly_id ?? plantObj.id) : null,
        });
      } else {
        const cleanName = id.split("(")[0].trim();
        const aiData = await PlantDoctorService.generateCareGuide(cleanName, homeId);
        details = careGuideToPlantDetails(aiData?.plantData ?? aiData, cleanName);
        // Wave 3 — forward catalogue metadata so the bulk-add processor can
        // skip the per-home plants INSERT and point inventory at the global row.
        if (aiData?.db_plant_id != null) {
          details.db_plant_id = aiData.db_plant_id;
          details.freshness_version = aiData.freshness_version ?? null;
          details.from_catalogue = aiData.fromCatalogue ?? false;
        }
      }
      setDetailsCache((prev) => new Map(prev).set(id, details));
    } catch {
      // silently fail
    } finally {
      fetchingDetailsRef.current.delete(id);
      setLoadingDetailsIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  useEffect(() => {
    plants.forEach(async (name) => {
      const [aiResult, api, verdantlyResult] = await Promise.all([
        isAiEnabled
          ? PlantDoctorService.searchPlantsText(name, { homeId })
              .then((d) => {
                const matches = (d.matches || []).slice(0, 3);
                // Plant was AI-suggested by the planner — always surface at least the name itself
                return {
                  matches: matches.length > 0 ? matches : [name],
                  hits: d.hits ?? {},
                };
              })
              .catch(() => ({ matches: [name] as string[], hits: {} as Record<string, CatalogueHit> }))
          : Promise.resolve({ matches: [] as string[], hits: {} as Record<string, CatalogueHit> }),
        isPremium
          ? PerenualService.searchPlants(name)
              .then((d) => (d || []).slice(0, 3))
              .catch(() => [] as any[])
          : ([] as any[]),
        VerdantlyService.searchPlants(name)
          .then((d) => ({ results: (d.results || []).slice(0, 3), failed: false }))
          .catch(() => ({ results: [] as any[], failed: true })),
      ]);

      setResults((prev) => ({
        ...prev,
        [name]: {
          ai: aiResult.matches,
          aiHits: aiResult.hits,
          api,
          verdantly: verdantlyResult.results,
          verdantlyFailed: verdantlyResult.failed,
          loading: false,
        },
      }));

      // Auto-select: AI first, then Verdantly, then Perenual
      const auto: Selection | null =
        aiResult.matches.length > 0
          ? { type: "ai", data: aiResult.matches[0] }
          : verdantlyResult.results.length > 0
            ? { type: "verdantly", data: verdantlyResult.results[0] }
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
    if (s.type === "verdantly") return (cur.data?.verdantly_id ?? cur.data?.id) === (s.data?.verdantly_id ?? s.data?.id);
    return String(cur.data?.id) === String(s.data?.id);
  };

  // Auto-prefetch care guides for AI results as each plant's results load
  useEffect(() => {
    if (!isAiEnabled) return;
    Object.values(results).forEach((r) => {
      if (r.loading) return;
      r.ai.forEach((match) => fetchDetails(match));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const toggleExpand = (id: string, plantObj?: any) => {
    setExpandedId((prev) => (prev === id ? null : id));
    fetchDetails(id, plantObj);
  };

  const renderInfoPanel = (id: string, plantName?: string) => (
    <div className="border-t border-rhozly-outline/10 bg-rhozly-surface-low/20 animate-in slide-in-from-top-2">
      <PlantInfoPanel
        details={detailsCache.get(id) ?? null}
        loading={loadingDetailsIds.has(id)}
        plantName={plantName}
      />
    </div>
  );

  const selectedItems = Object.values(selections).filter(Boolean) as Selection[];
  const allLoaded = Object.values(results).every((r) => !r.loading);

  const selectAll = () => {
    const newSelections: Record<string, Selection | null> = {};
    plants.forEach((name) => {
      const r = results[name];
      if (!r || r.loading) return;
      const best: Selection | null =
        r.ai.length > 0
          ? { type: "ai", data: r.ai[0] }
          : r.verdantly.length > 0
            ? { type: "verdantly", data: r.verdantly[0] }
            : r.api.length > 0
              ? { type: "api", data: r.api[0] }
              : null;
      if (best) newSelections[name] = best;
    });
    setSelections((prev) => ({ ...prev, ...newSelections }));
  };

  return (
    <div data-testid="plant-source-picker-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Choose plant source" className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden">

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
            const hasResults = r && (r.ai.length > 0 || r.api.length > 0 || r.verdantly.length > 0);

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
                  {r?.loading ? (
                    <div className="flex items-center gap-1.5 text-rhozly-on-surface/40">
                      <Loader2 size={12} className="animate-spin" />
                      <span className="text-[10px] font-bold">Searching…</span>
                    </div>
                  ) : selections[name] ? (
                    <span className="text-[8px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary/10 px-2 py-0.5 rounded-full">
                      Selected
                    </span>
                  ) : null}
                </div>

                {r?.loading ? (
                  <div className="p-6 flex items-center justify-center gap-2 text-rhozly-on-surface/30">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-xs font-bold">Searching databases…</span>
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
                            const cachedThumb = detailsCache.get(match)?.thumbnail_url;
                            const isExpanded = expandedId === match;
                            const hit = r.aiHits?.[match];
                            const cataloguePill = hit
                              ? hit.hit_kind === "home_fork"
                                ? { label: "Your custom version", cls: "text-purple-700 bg-purple-100" }
                                : { label: "In catalogue", cls: "text-emerald-700 bg-emerald-100" }
                              : null;

                            return (
                              <div
                                key={match}
                                className={`rounded-xl border overflow-hidden transition-all ${active ? "border-amber-400" : "border-transparent hover:border-amber-200"}`}
                              >
                                <div className={`flex items-center gap-3 p-2.5 ${active ? "bg-amber-50" : "hover:bg-amber-50/40"}`}>
                                  <button onClick={() => select(name, sel)} className="shrink-0" aria-label="Select">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${active ? "border-amber-500 bg-amber-500" : "border-rhozly-outline"}`}>
                                      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                  </button>
                                  <button onClick={() => select(name, sel)} className="w-10 h-10 rounded-lg bg-amber-500/10 shrink-0 overflow-hidden flex items-center justify-center">
                                    {cachedThumb ? (
                                      <img src={cachedThumb} alt={match} className="w-full h-full object-cover" />
                                    ) : (
                                      <IconAI size={14} className="text-amber-500" />
                                    )}
                                  </button>
                                  <button onClick={() => select(name, sel)} className="flex-1 min-w-0 text-left">
                                    <span className="text-xs font-bold text-rhozly-on-surface leading-tight block truncate">{match}</span>
                                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                      <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded-full inline-block">AI</span>
                                      {cataloguePill && (
                                        <span
                                          data-testid="ai-catalogue-pill"
                                          className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full inline-block ${cataloguePill.cls}`}
                                        >
                                          {cataloguePill.label}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                  <button
                                    onClick={() => toggleExpand(match)}
                                    className="p-2 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors shrink-0"
                                    aria-label="Show details"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : loadingDetailsIds.has(match) ? <Loader2 size={16} className="animate-spin" /> : <Info size={16} />}
                                  </button>
                                </div>
                                {isExpanded && renderInfoPanel(match, match.split("(")[0].trim())}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Verdantly results */}
                    {r.verdantly.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600/80 mb-1.5 px-1">
                          Verdantly Database
                        </p>
                        <div className="space-y-1.5">
                          {r.verdantly.map((plant: any) => {
                            const verdantlyKey = `verdantly-${plant.verdantly_id ?? plant.id}`;
                            const sel: Selection = { type: "verdantly", data: plant };
                            const active = isSelected(name, sel);
                            const isExpandedItem = expandedId === verdantlyKey;
                            const thumb = plant.thumbnail_url ?? null;
                            const sciName = plant.scientific_name?.[0] ?? null;

                            return (
                              <div
                                key={verdantlyKey}
                                className={`rounded-xl border overflow-hidden transition-all ${active ? "border-emerald-500" : "border-transparent hover:border-emerald-200"}`}
                              >
                                <div className={`flex items-center gap-3 p-2.5 ${active ? "bg-emerald-50" : "hover:bg-emerald-50/40"}`}>
                                  <button onClick={() => select(name, sel)} className="shrink-0" aria-label="Select">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${active ? "border-emerald-500 bg-emerald-500" : "border-rhozly-outline"}`}>
                                      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                  </button>
                                  <button onClick={() => select(name, sel)} className="w-10 h-10 rounded-lg bg-emerald-500/10 shrink-0 overflow-hidden flex items-center justify-center">
                                    {thumb ? (
                                      <img src={thumb} alt={plant.common_name} className="w-full h-full object-cover" />
                                    ) : (
                                      <IconPlantDB size={14} className="text-emerald-500/60" />
                                    )}
                                  </button>
                                  <button onClick={() => select(name, sel)} className="flex-1 min-w-0 text-left">
                                    <span className="text-xs font-bold text-rhozly-on-surface block truncate leading-tight">{plant.common_name}</span>
                                    {sciName && (
                                      <span className="text-[9px] italic text-rhozly-on-surface/50 block truncate">{sciName}</span>
                                    )}
                                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full inline-block mt-0.5">Verdantly</span>
                                  </button>
                                  <button
                                    onClick={() => toggleExpand(verdantlyKey, { ...plant, _provider: "verdantly" })}
                                    className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors shrink-0"
                                    aria-label="Show details"
                                  >
                                    {isExpandedItem ? <ChevronUp size={16} /> : loadingDetailsIds.has(verdantlyKey) ? <Loader2 size={16} className="animate-spin" /> : <Info size={16} />}
                                  </button>
                                </div>
                                {isExpandedItem && renderInfoPanel(verdantlyKey, plant.common_name)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Verdantly unavailable notice */}
                    {r.verdantlyFailed && r.verdantly.length === 0 && (
                      <div className="flex items-center gap-1.5 px-1 py-0.5">
                        <AlertCircle size={10} className="text-rhozly-on-surface/25 shrink-0" />
                        <span className="text-[9px] font-bold text-rhozly-on-surface/25">Verdantly database unavailable</span>
                      </div>
                    )}

                    {/* Perenual results */}
                    {isPremium && r.api.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-primary/80 mb-1.5 px-1">
                          API
                        </p>
                        <div className="space-y-1.5">
                          {r.api.map((plant: any) => {
                            const cacheKey = `api-${plant.id}`;
                            const sel: Selection = { type: "api", data: plant };
                            const active = isSelected(name, sel);
                            const isExpanded = expandedId === cacheKey;
                            const thumb =
                              plant.default_image?.thumbnail &&
                              !plant.default_image.thumbnail.includes("upgrade_access")
                                ? plant.default_image.thumbnail
                                : null;

                            return (
                              <div
                                key={plant.id}
                                className={`rounded-xl border overflow-hidden transition-all ${active ? "border-rhozly-primary" : "border-transparent hover:border-rhozly-primary/20"}`}
                              >
                                <div className={`flex items-center gap-3 p-2.5 ${active ? "bg-rhozly-primary/5" : "hover:bg-rhozly-primary/5"}`}>
                                  <button onClick={() => select(name, sel)} className="shrink-0" aria-label="Select">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${active ? "border-rhozly-primary bg-rhozly-primary" : "border-rhozly-outline"}`}>
                                      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                  </button>
                                  <button onClick={() => select(name, sel)} className="w-10 h-10 rounded-lg bg-rhozly-primary/5 shrink-0 overflow-hidden flex items-center justify-center">
                                    {thumb ? (
                                      <img src={thumb} alt={plant.common_name} className="w-full h-full object-cover" />
                                    ) : (
                                      <IconPlantDB size={14} className="text-rhozly-primary/40" />
                                    )}
                                  </button>
                                  <button onClick={() => select(name, sel)} className="flex-1 min-w-0 text-left">
                                    <span className="text-xs font-bold text-rhozly-on-surface block truncate leading-tight">{plant.common_name}</span>
                                    {plant.scientific_name?.[0] && (
                                      <span className="text-[9px] italic text-rhozly-on-surface/50 block truncate">{plant.scientific_name[0]}</span>
                                    )}
                                    <span className="text-[8px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary/10 px-1.5 py-0.5 rounded-full inline-block mt-0.5">Perenual</span>
                                  </button>
                                  <button
                                    onClick={() => toggleExpand(cacheKey, { ...plant, _provider: "perenual" })}
                                    className="p-2 rounded-lg hover:bg-rhozly-primary/10 text-rhozly-primary transition-colors shrink-0"
                                    aria-label="Show details"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : loadingDetailsIds.has(cacheKey) ? <Loader2 size={16} className="animate-spin" /> : <Info size={16} />}
                                  </button>
                                </div>
                                {isExpanded && renderInfoPanel(cacheKey, plant.common_name)}
                              </div>
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
        <div className="shrink-0 p-6 border-t border-rhozly-outline/10 bg-white flex flex-col gap-2">
          {allLoaded && plants.length > 1 && (
            <button
              data-testid="plant-source-select-all"
              onClick={selectAll}
              className="w-full py-2.5 border-2 border-rhozly-primary/30 text-rhozly-primary rounded-2xl font-black text-xs hover:bg-rhozly-primary/5 transition-colors"
            >
              Select All (Best Match)
            </button>
          )}
          <button
            data-testid="plant-source-picker-confirm"
            onClick={() =>
              onConfirm(
                selectedItems.map((item) => ({
                  ...item,
                  preloadedDetails:
                    item.type === "ai"
                      ? detailsCache.get(item.data as string)
                      : undefined,
                })),
              )
            }
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
