import React, { useState, useEffect, useCallback } from "react";
import {
  Loader2, Plus, CheckSquare, Square, ChevronDown, ChevronRight,
  Sprout, ShieldAlert, Minus, Lock, Info, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { fetchCompanions as fetchCompanionsCached, invalidateCompanions } from "../lib/companionCache";
import toast from "react-hot-toast";
import PlantSourcePicker from "./PlantSourcePicker";
import BulkSearchModal from "./BulkSearchModal";
import { PerenualService } from "../lib/perenualService";
import { VerdantlyService } from "../lib/verdantlyService";
import { PlantDoctorService } from "../services/plantDoctorService";
import { derivePlantLabels } from "../lib/plantLabels";
import { getHemisphere, normalizePeriods } from "../lib/seasonal";
import { buildAutoSeasonalSchedules } from "../lib/plantScheduleFactory";
import { searchWikimediaImages, searchPixabayImages } from "../lib/wikipedia";

interface CompanionPlant {
  id: string | null;
  name: string;
  scientificName?: string | null;
  reason?: string | null;
}

interface CompanionResult {
  beneficial: CompanionPlant[];
  harmful: CompanionPlant[];
  neutral: CompanionPlant[];
}

interface GalleryImage {
  id: string;
  thumb_url: string;
  full_url: string;
  alt: string;
}

interface Props {
  source: string;
  verdantlyId?: string | null;
  plantName: string;
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;
  onPlantsAdded?: () => void;
}

// ─── Inline image panel ────────────────────────────────────────────────────────

interface ImagePanelProps {
  plantName: string;
  reason: string | null | undefined;
  onClose: () => void;
}

function ImagePanel({ plantName, reason, onClose }: ImagePanelProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("plant-image-search", { body: { query: plantName, count: 4 } })
      .then(({ data }) => {
        if (!cancelled) setImages(data?.images ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [plantName]);

  const hasContent = loading || images.length > 0;

  return (
    <div className="mt-1 mb-2 mx-3 rounded-xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 overflow-hidden animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className="text-[10px] font-black text-rhozly-on-surface/50 uppercase tracking-widest">{plantName}</span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-rhozly-surface transition-colors">
          <X size={12} className="text-rhozly-on-surface/40" />
        </button>
      </div>

      {reason && (
        <p className="px-3 pb-2 text-[10px] font-semibold text-rhozly-on-surface/70 leading-relaxed">
          {reason}
        </p>
      )}

      {hasContent && (
        <div className="overflow-x-auto px-3 pb-3">
          <div className="flex gap-1.5">
            {loading
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="w-16 h-16 rounded-xl bg-rhozly-surface animate-pulse shrink-0" />
                ))
              : images.map((img) => (
                  <a
                    key={img.id}
                    href={img.full_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-xl overflow-hidden block"
                  >
                    <img
                      src={img.thumb_url}
                      alt={img.alt}
                      className="w-16 h-16 object-cover hover:scale-105 transition-transform"
                    />
                  </a>
                ))
            }
          </div>
        </div>
      )}

      {!loading && images.length === 0 && !reason && (
        <p className="px-3 pb-3 text-[10px] text-rhozly-on-surface/40">No additional information available.</p>
      )}
    </div>
  );
}

// ─── Section component ─────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  headerClass: string;
  plants: CompanionPlant[];
  checked: Set<string>;
  onToggle: (key: string) => void;
  expandedKey: string | null;
  onExpand: (key: string | null) => void;
  defaultOpen?: boolean;
}

function CompanionSection({
  title, icon, headerClass, plants, checked, onToggle,
  expandedKey, onExpand, defaultOpen = true,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (plants.length === 0) return null;

  return (
    <div className="rounded-2xl border border-rhozly-outline/10 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid={`companion-section-${title.toLowerCase()}`}
        className={`w-full flex items-center justify-between px-4 py-3 ${headerClass} font-black text-xs uppercase tracking-widest`}
      >
        <span className="flex items-center gap-2">
          {icon}
          {title} ({plants.length})
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div>
          {plants.map((plant) => {
            const key = plant.id ?? `ai-${plant.name}`;
            const isChecked = checked.has(key);
            const isExpanded = expandedKey === key;

            return (
              <div key={key} className="border-t border-rhozly-outline/5 first:border-t-0">
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Checkbox */}
                  <button
                    data-testid={`companion-plant-${key}`}
                    onClick={() => onToggle(key)}
                    className="shrink-0 mt-0.5 text-rhozly-primary"
                  >
                    {isChecked
                      ? <CheckSquare size={16} />
                      : <Square size={16} className="text-rhozly-on-surface/30" />}
                  </button>

                  {/* Name + scientific name */}
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-rhozly-on-surface">{plant.name}</span>
                    {plant.scientificName && (
                      <span className="block text-[10px] font-medium text-rhozly-on-surface/50 italic">{plant.scientificName}</span>
                    )}
                    {plant.reason && !isExpanded && (
                      <span className="block text-[10px] font-semibold text-rhozly-on-surface/60 mt-0.5 leading-relaxed line-clamp-2">{plant.reason}</span>
                    )}
                  </div>

                  {/* Info toggle */}
                  <button
                    onClick={() => onExpand(isExpanded ? null : key)}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors ${isExpanded ? "bg-rhozly-primary/10 text-rhozly-primary" : "hover:bg-rhozly-surface-low text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60"}`}
                    aria-label={isExpanded ? "Close details" : "Show details"}
                  >
                    <Info size={14} />
                  </button>
                </div>

                {/* Inline image panel */}
                {isExpanded && (
                  <ImagePanel
                    plantName={plant.name}
                    reason={plant.reason}
                    onClose={() => onExpand(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CompanionPlantsTab({
  source,
  verdantlyId,
  plantName,
  homeId,
  aiEnabled,
  isPremium,
  onPlantsAdded,
}: Props) {
  const [companions, setCompanions] = useState<CompanionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"ai_required" | "fetch_failed" | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [pickerSelections, setPickerSelections] = useState<{ type: "api" | "ai" | "verdantly"; data: any }[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  const fetchCompanions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const req = { source, verdantlyId: verdantlyId ?? null, plantName, aiEnabled };

    // Goes via the shared promise cache so a Library "pre-warm" call (fired
    // the moment the plant page opens) and this mount-fetch both await the
    // same network request — single Gemini call per plant viewed.
    //
    // The first call after navigating can fail transiently (edge fn cold
    // start, or the auth token not yet attached). Auto-retry once — invalidate
    // the cached result first (a 200-with-error body would otherwise replay)
    // and give the function a moment to warm — before surfacing the error.
    // `ai_required` is the tier gate, not a transient failure, so it never retries.
    try {
      const data = await fetchCompanionsCached(req);
      if (data.error === "ai_required") { setError("ai_required"); return; }
      if (data.error) throw new Error(data.error);
      setCompanions({ beneficial: data.beneficial, harmful: data.harmful, neutral: data.neutral });
    } catch {
      try {
        invalidateCompanions(req);
        await new Promise((r) => setTimeout(r, 900));
        const data = await fetchCompanionsCached(req);
        if (data.error === "ai_required") { setError("ai_required"); return; }
        if (data.error) throw new Error(data.error);
        setCompanions({ beneficial: data.beneficial, harmful: data.harmful, neutral: data.neutral });
      } catch {
        setError("fetch_failed");
      }
    } finally {
      setLoading(false);
    }
  }, [source, verdantlyId, plantName, aiEnabled]);

  useEffect(() => { fetchCompanions(); }, [fetchCompanions]);

  const toggleChecked = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const allCompanions = React.useMemo((): Map<string, CompanionPlant> => {
    if (!companions) return new Map();
    const map = new Map<string, CompanionPlant>();
    [...companions.beneficial, ...companions.harmful, ...companions.neutral].forEach((p) => {
      map.set(p.id ?? `ai-${p.name}`, p);
    });
    return map;
  }, [companions]);

  const fetchImageFallback = async (name: string): Promise<string> => {
    const [wiki, pixabay] = await Promise.all([
      searchWikimediaImages(name).catch(() => []),
      searchPixabayImages(name).catch(() => []),
    ]);
    return (wiki[0] as any)?.thumbUrl || (pixabay[0] as any)?.thumbUrl || "";
  };

  const saveToShed = async (skeleton: any, fullCareData?: any) => {
    const id = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
    skeleton.id = id;
    skeleton.home_id = homeId;
    if (skeleton.source === "api" || skeleton.source === "ai" || skeleton.source === "verdantly") {
      skeleton.labels = derivePlantLabels(fullCareData ?? {});
      if (!skeleton.sunlight && fullCareData?.sunlight?.length) skeleton.sunlight = fullCareData.sunlight;
    }
    const { data: saved, error: insertErr } = await supabase.from("plants").insert([skeleton]).select().single();
    if (insertErr) throw insertErr;
    const { data: homeData } = await supabase.from("homes").select("country, timezone").eq("id", homeId).single();
    const hemisphere = getHemisphere(homeData?.country, homeData?.timezone);
    const schedules = buildAutoSeasonalSchedules({
      plantId: saved.id, homeId, hemisphere,
      harvestPeriods: normalizePeriods(fullCareData?.harvest_season || skeleton.harvest_season),
      pruningPeriods: normalizePeriods(fullCareData?.pruning_month || skeleton.pruning_month),
      wateringMinDays: fullCareData?.watering_min_days || skeleton?.watering_min_days || 3,
      wateringMaxDays: fullCareData?.watering_max_days || skeleton?.watering_max_days || 14,
    });
    if (schedules.length > 0) await supabase.from("plant_schedules").insert(schedules);
    const harvestMeta = (fullCareData as any)?.plant_metadata ?? skeleton.plant_metadata;
    if (harvestMeta?.harvest_days_min && skeleton.source === "verdantly") {
      await supabase.from("plant_schedules").insert({
        plant_id: saved.id, home_id: homeId, title: "Check for harvest", task_type: "Harvest",
        trigger_event: "Planted", start_reference: "Trigger Date",
        start_offset_days: harvestMeta.harvest_days_min, end_reference: "Trigger Date",
        end_offset_days: harvestMeta.harvest_days_max ?? harvestMeta.harvest_days_min,
        frequency_days: 1, is_recurring: true, is_auto_generated: true,
      });
    }
    return saved;
  };

  const handleOpenSourcePicker = () => {
    if (checked.size === 0) return;
    setShowSourcePicker(true);
  };

  const handleSourcePickerConfirm = (items: { type: "api" | "ai" | "verdantly"; data: any }[]) => {
    setPickerSelections(items);
    setShowSourcePicker(false);
    setShowBulkModal(true);
  };

  const handleBulkAdd = async (items: { type: "api" | "ai" | "verdantly"; data: any; preloadedDetails?: any }[]) => {
    setShowBulkModal(false);
    if (!items.length) return;
    setIsBulkAdding(true);
    let addedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      try {
        if (item.type === "api") {
          let pId: string, details: any, defaultImage: any;
          if (typeof item.data === "string") {
            const res = await PerenualService.searchPlants(item.data);
            if (!res?.length) throw new Error("No match found");
            pId = String(res[0].id); defaultImage = res[0].default_image;
            details = await PerenualService.getPlantDetails(res[0].id);
          } else {
            pId = String(item.data.id); defaultImage = item.data.default_image;
            details = await PerenualService.getPlantDetails(item.data.id);
          }
          const { data: ex } = await supabase.from("plants").select("id").eq("home_id", homeId).eq("perenual_id", pId).maybeSingle();
          if (ex) { skippedCount++; continue; }
          let img = details.image_url || details.thumbnail_url || defaultImage?.original_url || defaultImage?.regular_url || defaultImage?.thumbnail || "";
          if (img.includes("upgrade_access")) img = "";
          if (img) {
            const { data: proxy, error: pe } = await supabase.functions.invoke("image-proxy", { body: { imageUrl: img, plantName: details.common_name } });
            if (!pe && proxy?.publicUrl) img = proxy.publicUrl.includes("kong:8000") ? proxy.publicUrl.replace("http://kong:8000", "http://127.0.0.1:54321") : proxy.publicUrl;
          }
          await saveToShed({ common_name: details.common_name, scientific_name: details.scientific_name, thumbnail_url: img, source: "api", perenual_id: pId }, details);
          addedCount++;
        } else if (item.type === "verdantly") {
          const vId = item.data.verdantly_id ?? String(item.data.id);
          const { data: ex } = await supabase.from("plants").select("id").eq("home_id", homeId).eq("verdantly_id", vId).maybeSingle();
          if (ex) { skippedCount++; continue; }
          const details = await VerdantlyService.getPlantDetails(vId);
          let img = details.image_url || details.thumbnail_url || "";
          if (img.includes("upgrade_access")) img = "";
          if (img) {
            const { data: proxy, error: pe } = await supabase.functions.invoke("image-proxy", { body: { imageUrl: img, plantName: details.common_name } });
            if (!pe && proxy?.publicUrl) img = proxy.publicUrl.includes("kong:8000") ? proxy.publicUrl.replace("http://kong:8000", "http://127.0.0.1:54321") : proxy.publicUrl;
          }
          if (!img) img = await fetchImageFallback(item.data.common_name ?? "");
          await saveToShed({ common_name: details.common_name, scientific_name: details.scientific_name, thumbnail_url: img, source: "verdantly", verdantly_id: vId, perenual_id: null, plant_metadata: (details as any).plant_metadata ?? null }, details);
          addedCount++;
        } else {
          const cleanName = typeof item.data === "string" ? item.data.split("(")[0].trim() : item.data.common_name;
          const { data: ex } = await supabase.from("plants").select("id").eq("home_id", homeId).ilike("common_name", cleanName).limit(1);
          if (ex?.length) { skippedCount++; continue; }
          let extracted: any;
          if ((item as any).preloadedDetails) {
            const pd = (item as any).preloadedDetails;
            extracted = { ...pd, common_name: pd.common_name ?? cleanName };
          } else {
            const ai = await PlantDoctorService.generateCareGuide(cleanName);
            if (!ai) throw new Error("AI failed");
            extracted = ai.plantData ?? ai;
            if (!extracted.common_name) extracted.common_name = cleanName;
          }
          let img = extracted.thumbnail_url || "";
          if (img.includes("kong:8000")) img = img.replace("http://kong:8000", "http://127.0.0.1:54321");
          if (!img) img = await fetchImageFallback(cleanName);
          extracted.thumbnail_url = img;
          await saveToShed({ ...extracted, source: "ai", perenual_id: null }, extracted);
          addedCount++;
        }
      } catch {
        skippedCount++;
      }
    }

    setIsBulkAdding(false);
    setChecked(new Set());
    onPlantsAdded?.();

    if (addedCount > 0 && skippedCount === 0) {
      toast.success(`${addedCount} plant${addedCount !== 1 ? "s" : ""} added to your Shed`);
    } else if (addedCount > 0) {
      toast.success(`${addedCount} added, ${skippedCount} skipped`);
    } else {
      toast(`Could not add plants — they may already be in your Shed`, { icon: "🌿" });
    }
  };

  const handleManualSave = async (plantData: any) => {
    setShowBulkModal(false);
    setIsBulkAdding(true);
    try {
      await saveToShed({ ...plantData, source: "manual", perenual_id: null }, plantData);
      toast.success(`${plantData.common_name} added to your Shed`);
      onPlantsAdded?.();
    } catch {
      toast.error("Failed to add plant to Shed.");
    } finally {
      setIsBulkAdding(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-rhozly-on-surface/40">
        <Loader2 className="animate-spin" size={28} />
        <p className="text-xs font-bold">Finding companion plants…</p>
      </div>
    );
  }

  // ── Upgrade message ────────────────────────────────────────────────────────
  if (error === "ai_required") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6">
        <div className="w-14 h-14 rounded-full bg-rhozly-surface-low flex items-center justify-center">
          <Lock size={24} className="text-rhozly-on-surface/40" />
        </div>
        <div>
          <p className="text-sm font-black text-rhozly-on-surface mb-1">AI Add-on Required</p>
          <p className="text-xs font-semibold text-rhozly-on-surface/60 leading-relaxed">
            Companion planting insights for non-Verdantly plants use Rhozly AI.
            Upgrade in <span className="font-black text-rhozly-primary">Account Settings</span> to unlock this.
          </p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error === "fetch_failed" || !companions) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6">
        <p className="text-xs font-bold text-rhozly-on-surface/50">Could not load companion data.</p>
        <button
          onClick={fetchCompanions}
          data-testid="companion-retry"
          className="px-4 py-2 min-h-[44px] bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasAny = companions.beneficial.length > 0 || companions.harmful.length > 0 || companions.neutral.length > 0;

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-rhozly-on-surface/40">
        <Sprout size={28} />
        <p className="text-xs font-bold">No companion data found for this plant.</p>
      </div>
    );
  }

  const sectionProps = { checked, onToggle: toggleChecked, expandedKey, onExpand: setExpandedKey };

  return (
    <div className="flex flex-col gap-3 pb-24">
      {/* What-is-companion-planting intro card */}
      <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl px-4 py-3">
        <p className="text-xs font-black text-emerald-800 mb-1 flex items-center gap-1.5">
          <Sprout size={13} /> What is companion planting?
        </p>
        <p className="text-[11px] font-bold text-emerald-700/80 leading-relaxed">
          Some plants help each other grow — by deterring pests, sharing nutrients, attracting pollinators, or providing shade.
          Other plants stunt each other when planted nearby. The list below shows pairings for <span className="font-black">{plantName}</span>.
        </p>
      </div>

      <p className="text-[10px] font-semibold text-rhozly-on-surface/50 leading-relaxed">
        Tap <Info size={10} className="inline" /> to see images. Tick the checkbox next to any companion you want to add to your Shed.
      </p>

      <CompanionSection
        title="Beneficial"
        icon={<Sprout size={13} />}
        headerClass="bg-emerald-50 text-emerald-700"
        plants={companions.beneficial}
        defaultOpen={true}
        {...sectionProps}
      />
      <CompanionSection
        title="Harmful"
        icon={<ShieldAlert size={13} />}
        headerClass="bg-red-50 text-red-700"
        plants={companions.harmful}
        defaultOpen={true}
        {...sectionProps}
      />
      <CompanionSection
        title="Neutral"
        icon={<Minus size={13} />}
        headerClass="bg-rhozly-surface-low text-rhozly-on-surface/60"
        plants={companions.neutral}
        defaultOpen={false}
        {...sectionProps}
      />

      {/* Sticky add-to-shed footer */}
      {checked.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] animate-in slide-in-from-bottom-3 duration-200">
          <button
            data-testid="companion-add-to-shed"
            onClick={handleOpenSourcePicker}
            className="flex items-center gap-2 px-6 py-3.5 min-h-[48px] bg-rhozly-primary text-white text-sm font-black rounded-2xl shadow-xl hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            Add {checked.size} to Shed
          </button>
        </div>
      )}

      {isBulkAdding && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-3 bg-rhozly-surface rounded-2xl px-6 py-4 shadow-2xl">
            <Loader2 size={20} className="animate-spin text-rhozly-primary" />
            <span className="text-sm font-black text-rhozly-on-surface">Adding plants…</span>
          </div>
        </div>
      )}

      {showSourcePicker && (
        <PlantSourcePicker
          plants={Array.from(checked).map((k) => allCompanions.get(k)?.name ?? k)}
          isPremium={isPremium}
          isAiEnabled={aiEnabled}
          homeId={homeId}
          onConfirm={handleSourcePickerConfirm}
          onClose={() => setShowSourcePicker(false)}
        />
      )}

      {showBulkModal && (
        <BulkSearchModal
          homeId={homeId}
          isPremium={isPremium}
          isAiEnabled={aiEnabled}
          initialCartItems={pickerSelections}
          onProceedToBulkAdd={handleBulkAdd}
          onManualSave={handleManualSave}
          onClose={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}
