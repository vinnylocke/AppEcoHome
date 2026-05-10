import React, { useState, useMemo, useEffect } from "react";
import {
  Search, ScanLine, ChevronRight, Loader2,
  Database, Sparkles, Edit3, CheckCircle2, Sprout, X, Images, AlertCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import SmartImage from "./SmartImage";
import { useCachedShed } from "../hooks/useCachedShed";
import SpriteWizardModal from "./SpriteWizardModal";
import PlantCameraView from "./PlantCameraView";
import CaptureGallery from "./CaptureGallery";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

// ─── Types ────────────────────────────────────────────────────────────────────

type SourceFilter = "all" | "manual" | "api" | "ai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_BADGE: Record<string, { label: string; colour: string; icon: React.ReactNode }> = {
  api:    { label: "Perenual", colour: "text-rhozly-primary",       icon: <Database size={10} /> },
  ai:     { label: "AI",       colour: "text-amber-500",            icon: <Sparkles size={10} /> },
  manual: { label: "Manual",   colour: "text-rhozly-on-surface/60", icon: <Edit3 size={10} /> },
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=400";

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlantVisualiser({ homeId, aiEnabled = false }: { homeId: string; aiEnabled?: boolean }) {
  const { plants, isInitialLoading, isError: shedIsError } = useCachedShed(homeId) as any;

  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<SourceFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showWizard, setShowWizard] = useState(false);
  const [confirmedSprites, setConfirmedSprites] = useState<Map<string, string> | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [captureCountLoading, setCaptureCountLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Active (non-archived) plants only
  const active = useMemo(
    () => plants.filter((p: any) => !p.is_archived),
    [plants],
  );

  const displayed = useMemo(() => {
    return active.filter((p: any) => {
      if (filterSource !== "all" && p.source !== filterSource) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (p.common_name || "").toLowerCase().includes(q) ||
        ((p.scientific_name || [])[0] || "").toLowerCase().includes(q)
      );
    });
  }, [active, filterSource, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedPlants = active.filter((p: any) => selected.has(String(p.id)));

  useEffect(() => {
    setCaptureCountLoading(true);
    supabase
      .from("visualiser_captures")
      .select("id", { count: "exact", head: true })
      .eq("home_id", homeId)
      .then(({ count, error }) => {
        if (error) {
          Logger.warn("PlantVisualiser: failed to fetch capture count", { error });
        } else {
          setCaptureCount(count ?? 0);
        }
        setCaptureCountLoading(false);
      });
  }, [homeId]);

  useEffect(() => {
    if (shedIsError && !isInitialLoading) {
      setFetchError(true);
    }
  }, [shedIsError, isInitialLoading]);

  useEffect(() => {
    if (!homeId) return;
    supabase
      .from("plants")
      .select("id", { count: "exact", head: true })
      .eq("home_id", homeId)
      .then(({ error }) => {
        if (error) {
          Logger.warn("PlantVisualiser: failed to fetch plants", { error });
          setFetchError(true);
        }
      });
  }, [homeId]);

  const handleContinueToSprites = () => setShowWizard(true);

  const handleOpenVisualiser = () => setShowCamera(true);

  const handleWizardComplete = (sprites: Map<string, string>) => {
    setConfirmedSprites(sprites);
    setShowWizard(false);
    toast.success("Plant sprites saved!");
  };

  const handleWizardClose = () => setShowWizard(false);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isInitialLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-rhozly-primary" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (!isInitialLoading && fetchError) {
    return (
      <div className="py-20 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20">
        <AlertCircle size={36} className="mx-auto mb-3 text-red-400" />
        <p className="font-black text-rhozly-on-surface/60">Could not load plants</p>
        <p className="text-xs font-bold text-rhozly-on-surface/30 mt-1">
          Pull down to retry
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-32">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-black text-3xl text-rhozly-on-surface tracking-tight">
            Plant Visualiser
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/40 mt-1">
            Select plants from your shed to place in the camera view
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {captureCountLoading ? (
            <div className="w-12 h-12 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-rhozly-on-surface/30" />
            </div>
          ) : captureCount > 0 ? (
            <button
              onClick={() => setShowGallery(true)}
              className="relative w-12 h-12 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 flex items-center justify-center hover:bg-rhozly-surface transition-colors"
              aria-label={`Open gallery (${captureCount} captures)`}
            >
              <Images size={20} className="text-rhozly-on-surface/60" />
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rhozly-primary text-white text-[10px] font-black flex items-center justify-center">
                {captureCount > 99 ? "99+" : captureCount}
              </span>
            </button>
          ) : null}
          <div className="w-12 h-12 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
            <ScanLine size={22} className="text-rhozly-primary" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your shed…"
          className="w-full pl-11 pr-4 py-3 rounded-2xl border border-rhozly-outline/20 bg-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
        />
      </div>

      {/* Source filter */}
      <div className="flex gap-1.5 bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/5 overflow-x-auto snap-x snap-mandatory">
        {(["all", "api", "ai", "manual"] as SourceFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterSource(s)}
            className={`snap-start flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
              filterSource === s
                ? "bg-white text-rhozly-primary shadow-sm border border-rhozly-outline/10"
                : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            }`}
          >
            {s === "all" ? "All" : s === "api" ? "Perenual" : s === "ai" ? "AI" : "Manual"}
          </button>
        ))}
      </div>

      {/* Result count */}
      <p className="text-xs font-bold text-rhozly-on-surface/40">
        {displayed.length} plant{displayed.length !== 1 ? "s" : ""}
        {selected.size > 0 && (
          <span className="ml-2 text-rhozly-primary">
            · {selected.size} selected
          </span>
        )}
      </p>

      {/* Empty state */}
      {displayed.length === 0 ? (
        <div className="py-20 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20">
          <Sprout size={36} className="mx-auto mb-3 text-rhozly-on-surface/20" />
          <p className="font-black text-rhozly-on-surface/40">
            {search || filterSource !== "all"
              ? "No plants match your filter."
              : "No plants in your shed yet."}
          </p>
          {!search && filterSource === "all" && (
            <p className="text-xs font-bold text-rhozly-on-surface/30 mt-1">
              Add plants to your shed first, then come back here to visualise them.
            </p>
          )}
        </div>
      ) : (
        /* Plant grid */
        <div data-testid="visualiser-plant-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((plant: any) => {
            const isSelected = selected.has(String(plant.id));
            const src = SOURCE_BADGE[plant.source] ?? SOURCE_BADGE.manual;

            return (
              <div
                key={plant.id}
                onClick={() => toggle(String(plant.id))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && toggle(String(plant.id))
                }
                aria-pressed={isSelected}
                aria-label={`${isSelected ? "Remove" : "Add"} ${plant.common_name} ${isSelected ? "from" : "to"} visualiser`}
                className={`bg-rhozly-surface-lowest rounded-[2.5rem] overflow-hidden border shadow-sm flex flex-col cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 ${
                  isSelected
                    ? "border-rhozly-primary ring-2 ring-rhozly-primary/20"
                    : "border-rhozly-outline/20 hover:border-rhozly-primary/30"
                }`}
              >
                {/* Image header */}
                <div className="h-44 relative overflow-hidden bg-rhozly-primary/5">
                  <SmartImage
                    src={plant.thumbnail_url || FALLBACK_IMAGE}
                    alt={plant.common_name}
                    loading="lazy"
                    decoding="async"
                    className={`w-full h-full object-cover transition-all duration-300 ${
                      isSelected ? "brightness-90" : ""
                    }`}
                  />

                  {/* Source badge — top left */}
                  <div className="absolute top-4 left-4">
                    <span
                      className={`bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm border border-white/20 ${src.colour}`}
                    >
                      {src.icon} {src.label}
                    </span>
                  </div>

                  {/* Selected checkmark — top right */}
                  <div className={`absolute top-4 right-4 transition-transform duration-150 ${isSelected ? "scale-100" : "scale-0"}`}>
                    <div className="w-9 h-9 rounded-full bg-rhozly-primary shadow-lg flex items-center justify-center">
                      <CheckCircle2 size={20} className="text-white" />
                    </div>
                  </div>

                  {/* Selection overlay tint */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-rhozly-primary/10 pointer-events-none" />
                  )}
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="text-xl font-black text-rhozly-on-surface leading-tight mb-1">
                    {plant.common_name}
                  </h3>
                  <p className="text-xs font-bold text-rhozly-on-surface/40 italic truncate">
                    {(plant.scientific_name || [])[0] || "Unknown Species"}
                  </p>

                  <div className="mt-auto pt-5 border-t border-rhozly-outline/10">
                    <p
                      className={`text-xs font-black uppercase tracking-widest transition-colors ${
                        isSelected ? "text-rhozly-primary" : "text-rhozly-on-surface/30"
                      }`}
                    >
                      {isSelected ? "✓ Added to visualiser" : "Tap to select"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sprite wizard */}
      {showWizard && (
        <SpriteWizardModal
          plants={selectedPlants}
          homeId={homeId}
          onComplete={handleWizardComplete}
          onClose={handleWizardClose}
        />
      )}

      {/* Camera view */}
      {showCamera && confirmedSprites && (
        <PlantCameraView
          plants={selectedPlants}
          sprites={confirmedSprites}
          homeId={homeId}
          aiEnabled={aiEnabled}
          onClose={() => setShowCamera(false)}
          onCapture={() => {
            setCaptureCount(c => c + 1);
            setShowCamera(false);
            setShowGallery(true);
          }}
        />
      )}

      {/* Capture gallery */}
      {showGallery && (
        <CaptureGallery
          homeId={homeId}
          onClose={() => setShowGallery(false)}
        />
      )}

      {/* Sticky cart bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
        <div className="max-w-5xl mx-auto pointer-events-auto">
          <div className="bg-rhozly-surface-lowest shadow-2xl border border-rhozly-outline/20 rounded-2xl p-4 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
                <span className="transition-all duration-150 tabular-nums">{selected.size}</span> Plant{selected.size !== 1 ? "s" : ""} Selected
                {confirmedSprites && (
                  <span className="ml-2 text-rhozly-primary">· sprites ready</span>
                )}
              </p>
              {selected.size > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPlants.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => toggle(String(p.id))}
                      className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 min-h-[44px] bg-rhozly-primary/10 border border-rhozly-primary/20 rounded-full text-xs font-black text-rhozly-primary hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition-colors"
                      aria-label={`Remove ${p.common_name}`}
                    >
                      {p.common_name}
                      <span className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center">
                        <X size={14} strokeWidth={2.5} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-bold text-rhozly-on-surface/30">
                  Select at least one plant to continue
                </p>
              )}
            </div>

            <div className="shrink-0 flex flex-col items-end gap-2">
              {confirmedSprites && selected.size > 0 ? (
                <>
                  <button
                    onClick={handleOpenVisualiser}
                    className="px-6 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm flex items-center gap-2 hover:scale-[1.02] transition-transform shadow-lg"
                  >
                    Open Visualiser <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={handleContinueToSprites}
                    className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors"
                  >
                    Re-do sprites
                  </button>
                </>
              ) : (
                <button
                  data-testid="visualiser-open-camera-btn"
                  onClick={selected.size > 0 ? handleContinueToSprites : undefined}
                  disabled={selected.size === 0}
                  aria-disabled={selected.size === 0}
                  className={`px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 transition-all shadow-lg ${
                    selected.size === 0
                      ? "bg-rhozly-surface-low text-rhozly-on-surface/30 cursor-not-allowed shadow-none"
                      : "bg-rhozly-primary text-white hover:scale-[1.02] cursor-pointer"
                  }`}
                >
                  Continue to Sprites <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
