import React, { useState, useEffect, useCallback } from "react";
import {
  Loader2, Plus, CheckSquare, Square, ChevronDown, ChevronRight,
  Sprout, ShieldAlert, Minus, Lock, Info, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

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
  onPlantsAdded,
}: Props) {
  const [companions, setCompanions] = useState<CompanionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"ai_required" | "fetch_failed" | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchCompanions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("companion-planting", {
        body: {
          source,
          verdantly_id: verdantlyId ?? null,
          plant_name: plantName,
          ai_enabled: aiEnabled,
        },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (data?.error === "ai_required") { setError("ai_required"); return; }
      if (data?.error) throw new Error(data.error);

      setCompanions(data as CompanionResult);
    } catch {
      setError("fetch_failed");
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

  const handleAddToShed = async () => {
    if (checked.size === 0) return;
    setAdding(true);

    const selectedPlants = Array.from(checked).map((k) => allCompanions.get(k)).filter(Boolean) as CompanionPlant[];

    try {
      const verdantlyIds = selectedPlants.filter((p) => p.id).map((p) => p.id as string);
      const aiNames = selectedPlants.filter((p) => !p.id).map((p) => p.name);

      const alreadyInShed = new Set<string>();

      if (verdantlyIds.length > 0) {
        const { data: existing } = await supabase.from("plants").select("verdantly_id").eq("home_id", homeId).in("verdantly_id", verdantlyIds);
        (existing ?? []).forEach((r: any) => { if (r.verdantly_id) alreadyInShed.add(r.verdantly_id); });
      }
      if (aiNames.length > 0) {
        const { data: existing } = await supabase.from("plants").select("common_name").eq("home_id", homeId).in("common_name", aiNames);
        (existing ?? []).forEach((r: any) => { if (r.common_name) alreadyInShed.add(`ai-${r.common_name}`); });
      }

      const toAdd = selectedPlants.filter((p) => !alreadyInShed.has(p.id ?? `ai-${p.name}`));
      const skippedCount = selectedPlants.length - toAdd.length;

      if (toAdd.length === 0) {
        toast(`All selected plants are already in your Shed`, { icon: "🌿" });
        return;
      }

      const manualId = () => Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 10000);
      let addedCount = 0;

      for (const plant of toAdd) {
        if (plant.id) {
          try {
            const { data: details } = await supabase.functions.invoke("verdantly-search", { body: { action: "details", id: plant.id } });
            if (details && !details.error) {
              await supabase.from("plants").insert([{
                id: manualId(), home_id: homeId,
                common_name: details.common_name ?? plant.name,
                scientific_name: details.scientific_name ?? [],
                source: "verdantly", verdantly_id: plant.id,
                thumbnail_url: details.image_url ?? details.thumbnail_url ?? null,
                image_url: details.image_url ?? null,
                watering: details.watering ?? null,
                watering_min_days: details.watering_min_days ?? null,
                watering_max_days: details.watering_max_days ?? null,
                sunlight: details.sunlight ?? [],
                care_level: details.care_level ?? null,
                cycle: details.cycle ?? null,
                is_edible: details.is_edible ?? false,
                is_toxic_pets: details.is_toxic_pets ?? false,
                is_toxic_humans: details.is_toxic_humans ?? false,
                growth_habit: details.growth_habit ?? null,
                days_to_harvest_min: details.days_to_harvest_min ?? null,
                days_to_harvest_max: details.days_to_harvest_max ?? null,
                soil_ph_min: details.soil_ph_min ?? null,
                soil_ph_max: details.soil_ph_max ?? null,
                planting_instructions: details.planting_instructions ?? null,
              }]);
              addedCount++;
            } else {
              await supabase.from("plants").insert([{ id: manualId(), home_id: homeId, common_name: plant.name, scientific_name: plant.scientificName ? [plant.scientificName] : [], source: "verdantly", verdantly_id: plant.id }]);
              addedCount++;
            }
          } catch { /* skip */ }
        } else {
          await supabase.from("plants").insert([{ id: manualId(), home_id: homeId, common_name: plant.name, scientific_name: plant.scientificName ? [plant.scientificName] : [], source: "manual" }]);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        const msg = skippedCount > 0
          ? `${addedCount} companion${addedCount !== 1 ? "s" : ""} added to your Shed (${skippedCount} already there)`
          : `${addedCount} companion${addedCount !== 1 ? "s" : ""} added to your Shed`;
        toast.success(msg);
        setChecked(new Set());
        onPlantsAdded?.();
      }
    } catch {
      toast.error("Failed to add companions to Shed.");
    } finally {
      setAdding(false);
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
            onClick={handleAddToShed}
            disabled={adding}
            className="flex items-center gap-2 px-6 py-3.5 min-h-[48px] bg-rhozly-primary text-white text-sm font-black rounded-2xl shadow-xl hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add {checked.size} to Shed
          </button>
        </div>
      )}
    </div>
  );
}
