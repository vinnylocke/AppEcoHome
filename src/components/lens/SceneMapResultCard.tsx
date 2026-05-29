import React, { useEffect, useRef, useState } from "react";
import { Sprout, Info, ChevronUp, BookOpen, Check, Loader2, Plus, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import type { SceneMapResult, SceneCandidate } from "../../services/plantDoctorService";
import type { PlantDetails, ProviderSearchResult } from "../../lib/verdantlyUtils";
import { boxToPercent, clampConfidence, type Box2d } from "../../lib/sceneMap";
import { resolvePlantInfo } from "../../lib/plantInfoResolver";
import { ensureCataloguePlantFromSearchResult } from "../../lib/plantCatalogue";
import { saveToShed } from "../../lib/saveToShed";
import { supabase } from "../../lib/supabase";
import { EVENT, logEvent } from "../../events/registry";
import { Logger } from "../../lib/errorHandler";
import PlantInfoPanel from "../PlantInfoPanel";
import PlantDetailModal from "../PlantDetailModal";

interface Props {
  imageUrl: string;
  result: SceneMapResult;
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;
  /** Fired after plants are added to the Shed so the host can refresh. */
  onPlantsAdded?: () => void;
}

// Distinct, repeating palette so adjacent boxes/rows are easy to tell apart.
const PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4",
  "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#eab308",
];
const colorFor = (i: number) => PALETTE[i % PALETTE.length];
const ck = (r: number, c: number) => `${r}-${c}`;

/**
 * Multi-ID result — the photo with a numbered, colour-coded box per detected
 * plant, and a mapping below. Per detected plant the user can: pick + confirm
 * one of its candidate identities, tap a candidate for library-first/AI info
 * (pills + description + "See full care" → PlantDetailModal), and tick plants
 * to add to the Shed (their confirmed identity, resolved library-first then AI).
 */
export default function SceneMapResultCard({ imageUrl, result, homeId, aiEnabled, isPremium, onPlantsAdded }: Props) {
  const regions = result.regions ?? [];

  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  // Which candidate is selected per region (defaults to the top-ranked one).
  const [selected, setSelected] = useState<Map<number, number>>(new Map());
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState<Set<number>>(new Set());
  // Per-candidate (keyed "r-c") inline info resolution.
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [infoDetails, setInfoDetails] = useState<Map<string, PlantDetails | null>>(new Map());
  const [infoResult, setInfoResult] = useState<Map<string, ProviderSearchResult>>(new Map());
  const [infoLoading, setInfoLoading] = useState<Set<string>>(new Set());
  const [detailResult, setDetailResult] = useState<ProviderSearchResult | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (activeRegion == null) return;
    rowRefs.current[activeRegion]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeRegion]);

  const selectedIdx = (r: number) => selected.get(r) ?? 0;
  const selectedCand = (r: number): SceneCandidate | undefined => regions[r]?.candidates[selectedIdx(r)];

  const resolveInfo = async (r: number, c: number) => {
    const key = ck(r, c);
    if (infoResult.has(key)) {
      return { details: infoDetails.get(key) ?? null, result: infoResult.get(key)! };
    }
    const cand = regions[r].candidates[c];
    setInfoLoading((prev) => new Set(prev).add(key));
    try {
      const resolved = await resolvePlantInfo(cand.name, cand.scientific_name);
      setInfoDetails((prev) => new Map(prev).set(key, resolved.details));
      setInfoResult((prev) => new Map(prev).set(key, resolved.result));
      return resolved;
    } finally {
      setInfoLoading((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  const handlePreview = (r: number, c: number) => {
    const key = ck(r, c);
    setExpandedInfo((prev) => (prev === key ? null : key));
    if (!infoResult.has(key)) resolveInfo(r, c);
  };

  const openCareGuide = async (r: number, c: number) => {
    const resolved = await resolveInfo(r, c);
    setDetailResult(resolved.result);
  };

  const confirmRegion = (r: number) => {
    setConfirmed((prev) => { const s = new Set(prev); s.add(r); return s; });
    const cand = selectedCand(r);
    if (cand) logEvent(EVENT.AI_IDENTIFY, { multi_id_confirmed: cand.name });
  };

  const toggleCheck = (r: number) => {
    setChecked((prev) => { const s = new Set(prev); s.has(r) ? s.delete(r) : s.add(r); return s; });
  };

  const handleAddToShed = async () => {
    if (checked.size === 0) return;
    setIsAdding(true);
    let added = 0;
    let skipped = 0;
    try {
      for (const r of checked) {
        const c = selectedIdx(r);
        const cand = regions[r]?.candidates[c];
        if (!cand) continue;
        // Skip if a plant with this common name is already in the home.
        const { data: existing } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .ilike("common_name", cand.name)
          .limit(1);
        if (existing && existing.length > 0) { skipped++; continue; }

        const resolved = infoResult.has(ck(r, c))
          ? { result: infoResult.get(ck(r, c))!, details: infoDetails.get(ck(r, c)) ?? null }
          : await resolvePlantInfo(cand.name, cand.scientific_name);
        const catalogue = await ensureCataloguePlantFromSearchResult(resolved.result, { homeId });
        const d = catalogue.details;
        await saveToShed(
          {
            common_name: d.common_name,
            scientific_name: d.scientific_name,
            thumbnail_url: d.thumbnail_url ?? d.image_url ?? null,
            source: catalogue.source,
            perenual_id: d.perenual_id ?? null,
            verdantly_id: d.verdantly_id ?? null,
            sunlight: d.sunlight,
            watering_min_days: d.watering_min_days ?? null,
            watering_max_days: d.watering_max_days ?? null,
            harvest_season: d.harvest_season,
            pruning_month: d.pruning_month,
          },
          d as unknown as Record<string, unknown>,
          homeId,
        );
        added++;
      }
      if (added > 0) {
        toast.success(`Added ${added} plant${added === 1 ? "" : "s"} to your Shed${skipped ? ` (${skipped} already there)` : ""}.`);
        setChecked(new Set());
        onPlantsAdded?.();
      } else if (skipped > 0) {
        toast(`${skipped === 1 ? "That plant is" : "Those plants are"} already in your Shed.`);
      }
    } catch (err: any) {
      Logger.error("Multi-ID add to shed failed", err, { homeId }, err?.message || "Couldn't add plants to your Shed.");
    } finally {
      setIsAdding(false);
    }
  };

  if (regions.length === 0) {
    return (
      <div
        data-testid="scene-map-result"
        className="flex flex-col items-center justify-center gap-3 py-12 text-center text-rhozly-on-surface/50"
      >
        <Sprout size={28} className="text-rhozly-primary/40" />
        <p className="text-sm font-black text-rhozly-on-surface/70">No distinct plants found</p>
        <p className="text-xs font-bold max-w-xs">
          Try a clearer, wider shot in good light — and make sure the plants you want identified are in frame.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="scene-map-result" className="space-y-5 pb-24">
      {/* Photo with the detected-plant overlay */}
      <div className="relative rounded-3xl overflow-hidden border border-rhozly-outline/15 bg-rhozly-surface-low/40">
        <img src={imageUrl} alt="Your plants" className="block w-full h-auto select-none" draggable={false} />
        {regions.map((region, i) => {
          const { topPct, leftPct, widthPct, heightPct } = boxToPercent(region.box as Box2d);
          const isActive = activeRegion === i;
          const color = colorFor(i);
          return (
            <button
              key={i}
              type="button"
              data-testid={`scene-map-box-${i}`}
              onClick={() => setActiveRegion((prev) => (prev === i ? null : i))}
              aria-label={`Plant ${i + 1}`}
              aria-pressed={isActive}
              className="absolute rounded-lg transition-all"
              style={{
                top: `${topPct}%`,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
                border: `2.5px solid ${color}`,
                boxShadow: isActive ? `0 0 0 3px ${color}66` : "none",
                background: isActive ? `${color}1f` : "transparent",
                zIndex: isActive ? 2 : 1,
              }}
            >
              <span
                className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow"
                style={{ background: color }}
              >
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>

      {result.notes && (
        <p className="text-[11px] font-bold text-rhozly-on-surface/55 leading-relaxed px-1">{result.notes}</p>
      )}

      {/* Mapping — select + confirm, info, and check-to-add per detected plant */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1">
          Pick the right plant, then confirm or add to your Shed
        </p>
        {regions.map((region, i) => {
          const color = colorFor(i);
          const isActive = activeRegion === i;
          const isConfirmed = confirmed.has(i);
          const isChecked = checked.has(i);
          const selIdx = selectedIdx(i);
          return (
            <div
              key={i}
              ref={(el) => { rowRefs.current[i] = el; }}
              data-testid={`scene-map-region-${i}`}
              onClick={() => setActiveRegion(i)}
              className={`rounded-2xl border bg-white p-3 transition-all ${
                isActive ? "border-rhozly-primary ring-1 ring-rhozly-primary/30" : "border-rhozly-outline/15"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
                  style={{ background: color }}
                >
                  {i + 1}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  Plant {i + 1}
                </span>
                {/* Check-to-add */}
                <button
                  type="button"
                  data-testid={`scene-map-check-${i}`}
                  onClick={(e) => { e.stopPropagation(); toggleCheck(i); }}
                  aria-pressed={isChecked}
                  aria-label={isChecked ? "Remove from Shed selection" : "Select to add to Shed"}
                  className="ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50"
                >
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${isChecked ? "bg-rhozly-primary border-rhozly-primary text-white" : "bg-white border-rhozly-outline/30 text-transparent"}`}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  Add
                </button>
              </div>

              {/* Selectable, weighted candidates */}
              <ul className="space-y-1.5">
                {region.candidates.map((c, j) => {
                  const pct = clampConfidence(c.confidence);
                  const key = ck(i, j);
                  const isSel = selIdx === j;
                  const isInfoOpen = expandedInfo === key;
                  return (
                    <li key={j}>
                      <div className="flex items-center gap-2">
                        {/* Radio select */}
                        <button
                          type="button"
                          data-testid={`scene-map-candidate-${i}-${j}`}
                          onClick={(e) => { e.stopPropagation(); setSelected((prev) => new Map(prev).set(i, j)); }}
                          aria-pressed={isSel}
                          aria-label={`Select ${c.name}`}
                          className="shrink-0"
                        >
                          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${isSel ? "border-rhozly-primary" : "border-rhozly-outline/30"}`}>
                            {isSel && <span className="w-2 h-2 rounded-full bg-rhozly-primary" />}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelected((prev) => new Map(prev).set(i, j)); }}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0">
                              <span className={`text-sm ${isSel ? "font-black text-rhozly-on-surface" : "font-bold text-rhozly-on-surface/70"} leading-tight`}>{c.name}</span>
                              {c.scientific_name && (
                                <span className="block text-[10px] font-medium italic text-rhozly-on-surface/45 truncate">{c.scientific_name}</span>
                              )}
                            </span>
                            <span className="text-[11px] font-black text-rhozly-on-surface/60 shrink-0 tabular-nums">{pct}%</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-rhozly-surface-low overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color, opacity: isSel ? 1 : 0.55 }} />
                          </div>
                        </button>
                        {/* Info toggle */}
                        <button
                          type="button"
                          data-testid={`scene-map-info-${i}-${j}`}
                          onClick={(e) => { e.stopPropagation(); handlePreview(i, j); }}
                          aria-label={isInfoOpen ? "Hide details" : "View details"}
                          aria-expanded={isInfoOpen}
                          className={`shrink-0 p-1.5 rounded-lg transition-colors ${isInfoOpen ? "bg-rhozly-primary/10 text-rhozly-primary" : "text-rhozly-on-surface/40 hover:text-rhozly-primary hover:bg-rhozly-primary/5"}`}
                        >
                          {infoLoading.has(key) ? <Loader2 size={14} className="animate-spin" /> : isInfoOpen ? <ChevronUp size={14} /> : <Info size={14} />}
                        </button>
                      </div>

                      {/* Inline info — pills + description + See full care */}
                      {isInfoOpen && (
                        <div className="mt-2 rounded-xl border border-rhozly-outline/10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                          <PlantInfoPanel details={infoDetails.get(key) ?? null} loading={infoLoading.has(key)} plantName={c.name} />
                          <div className="px-3 pb-3">
                            <button
                              type="button"
                              data-testid={`scene-map-see-care-${i}-${j}`}
                              onClick={(e) => { e.stopPropagation(); openCareGuide(i, j); }}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-rhozly-primary/30 text-xs font-black text-rhozly-primary hover:bg-rhozly-primary/5 transition-colors"
                            >
                              <BookOpen size={14} /> See full care
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Confirm */}
              <div className="mt-2.5 flex items-center justify-end">
                {isConfirmed ? (
                  <span data-testid={`scene-map-confirmed-${i}`} className="inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-600">
                    <CheckCircle2 size={14} /> Confirmed: {selectedCand(i)?.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid={`scene-map-confirm-${i}`}
                    onClick={(e) => { e.stopPropagation(); confirmRegion(i); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rhozly-outline/20 text-[11px] font-black text-rhozly-on-surface/70 hover:border-rhozly-primary/40 hover:text-rhozly-primary transition-colors"
                  >
                    <Check size={13} /> Confirm {selectedCand(i)?.name ?? "this"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky add-to-shed footer */}
      {checked.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] animate-in slide-in-from-bottom-3 duration-200">
          <button
            type="button"
            data-testid="scene-map-add-to-shed"
            onClick={handleAddToShed}
            disabled={isAdding}
            className="flex items-center gap-2 px-6 py-3.5 min-h-[48px] bg-rhozly-primary text-white text-sm font-black rounded-2xl shadow-xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add {checked.size} to Shed
          </button>
        </div>
      )}

      {detailResult && (
        <PlantDetailModal
          result={detailResult}
          homeId={homeId}
          aiEnabled={aiEnabled}
          isPremium={isPremium}
          onClose={() => setDetailResult(null)}
        />
      )}
    </div>
  );
}
