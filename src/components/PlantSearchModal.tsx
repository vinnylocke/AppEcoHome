import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ChevronLeft, Plus } from "lucide-react";
import { IconPlantDB } from "../constants/icons";
import { supabase } from "../lib/supabase";
import { getProviderPlantDetails, careGuideToPlantDetails } from "../lib/plantProvider";
import { PlantDoctorService } from "../services/plantDoctorService";
import toast from "react-hot-toast";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantSearch from "./shared/PlantSearch";
import { libraryRowToPlantDetails } from "../lib/plantCatalogue";
import type { PlantSelection } from "../lib/unifiedPlantSearch";
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface Props {
  homeId: string;
  isPremium: boolean;
  isAiEnabled?: boolean;
  onClose: () => void;
  onSuccess: (newPlant?: any) => void;
  initialSearchTerm?: string;
  initialScientificName?: string;
  /**
   * Optional Tailwind z-index class — used when the modal is mounted on
   * top of another modal that already lives at z-[100] (e.g. the
   * Nursery packet editor). Defaults to "z-[100]" for the standalone
   * usages where nothing else is on screen.
   */
  zIndexClassName?: string;
}

/**
 * Global plant picker — migrated onto the shared, library-first
 * <PlantSearch> engine. Local plant_library results are free for every
 * tier; Perenual/Verdantly are opt-in and AI-create is Sage+. Tapping a
 * result loads a read-only preview, and "Add to My Shed" inserts the
 * `plants` row and hands it back via `onSuccess` (single-add — the host,
 * e.g. the Nursery packet editor, links the returned row).
 *
 * The preview + insert (`handleAddToShed`) + `onSuccess` contract is
 * unchanged from the legacy fan-out version; only the search half swapped.
 */
export default function PlantSearchModal({
  homeId,
  isPremium: _isPremium,
  isAiEnabled = false,
  onClose,
  onSuccess,
  initialSearchTerm,
  initialScientificName: _initialScientificName,
  zIndexClassName = "z-[100]",
}: Props) {
  const { setPageContext } = usePlantDoctor();

  const [previewPlant, setPreviewPlant] = useState<any | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape to close.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setPageContext({
      action: previewPlant
        ? "Previewing Plant Before Adding (Nursery picker)"
        : "Searching Plants (Nursery picker)",
      previewedPlant: previewPlant
        ? {
            commonName: previewPlant.common_name,
            scientificName: previewPlant.scientific_name?.[0],
            cycle: previewPlant.cycle,
            watering: previewPlant.watering,
            sunlight: previewPlant.sunlight,
          }
        : null,
    });
    return () => setPageContext(null);
  }, [previewPlant, setPageContext]);

  /**
   * A search selection → read-only preview. Library rows are previewed
   * instantly from the row we already hold (or a quick fetch for an
   * AI-just-created row that didn't carry `raw`); provider rows fetch
   * full details; AI rows synthesise a care guide. The resulting
   * `previewPlant` shape matches what `handleAddToShed` expects.
   */
  const handleSelect = async (sel: PlantSelection) => {
    setIsFetchingPreview(true);
    try {
      let fullPlantData: any;
      if (sel.source === "library") {
        let lib: any = sel.raw;
        if (!lib && sel.library_id != null) {
          const { data } = await supabase
            .from("plant_library")
            .select("*")
            .eq("id", sel.library_id)
            .maybeSingle();
          lib = data;
        }
        if (!lib) throw new Error("Library row not found");
        fullPlantData = libraryRowToPlantDetails(lib);
      } else if (sel.source === "ai") {
        const guide = await PlantDoctorService.generateCareGuide(sel.common_name, homeId);
        fullPlantData = careGuideToPlantDetails(guide?.plantData ?? guide, sel.common_name);
        // Wave 3 — propagate catalogue identity so add-to-shed can point at the
        // global plant row instead of creating a per-home duplicate.
        if (guide?.db_plant_id != null) {
          fullPlantData.db_plant_id = guide.db_plant_id;
          fullPlantData.freshness_version = guide.freshness_version ?? null;
          fullPlantData.from_catalogue = guide.fromCatalogue ?? false;
        }
      } else {
        fullPlantData = await getProviderPlantDetails({
          source: sel.source === "verdantly" ? "verdantly" : "api",
          perenual_id:
            sel.source === "verdantly"
              ? null
              : sel.perenual_id ?? (sel.raw as any)?.perenual_id ?? (sel.raw as any)?.id ?? null,
          verdantly_id:
            sel.source === "verdantly"
              ? sel.verdantly_id ?? (sel.raw as any)?.verdantly_id ?? (sel.raw as any)?.id ?? null
              : null,
        });
      }

      const safeImage =
        [fullPlantData.image_url, fullPlantData.thumbnail_url, sel.thumbnail_url].find(
          (u) => u && typeof u === "string" && !u.includes("upgrade_access"),
        ) ?? "";

      const isLibrary = sel.source === "library";
      setPreviewPlant({
        ...fullPlantData,
        image_url: safeImage,
        thumbnail_url: safeImage,
        // Library rows are saved through the AI insert branch (source "ai");
        // everything else keeps its own provider identity.
        _provider: isLibrary ? "ai" : sel.source,
        source: isLibrary ? "ai" : (fullPlantData.source ?? sel.source),
      });
    } catch {
      toast.error("Failed to load plant details.");
    } finally {
      setIsFetchingPreview(false);
    }
  };

  const handleAddToShed = async () => {
    if (!previewPlant) return;
    setIsAdding(true);

    const isVerdantly = previewPlant.source === "verdantly";
    const isAi = previewPlant.source === "ai" || previewPlant._provider === "ai";

    try {
      // Duplicate check per provider
      let existingPlant: any = null;
      if (isVerdantly && previewPlant.verdantly_id) {
        const { data, error } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .eq("verdantly_id", previewPlant.verdantly_id)
          .maybeSingle();
        if (error) throw new Error("Could not verify if plant exists. Try again.");
        existingPlant = data;
      } else if (isAi) {
        // AI / library plants don't have a stable provider ID. Match on
        // common_name within the home (same check the bulk-add uses).
        const { data, error } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .ilike("common_name", previewPlant.common_name)
          .limit(1);
        if (error) throw new Error("Could not verify if plant exists. Try again.");
        existingPlant = data && data.length > 0 ? data[0] : null;
      } else {
        const pId = String(previewPlant.perenual_id);
        const { data, error } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .eq("perenual_id", pId)
          .maybeSingle();
        if (error) throw new Error("Could not verify if plant exists. Try again.");
        existingPlant = data;
      }

      if (existingPlant) {
        toast.error(`${previewPlant.common_name} is already in your Shed!`, { icon: "🚫" });
        setIsAdding(false);
        return;
      }

      let permanentImageUrl = previewPlant.image_url || previewPlant.thumbnail_url || "";

      if (permanentImageUrl) {
        try {
          const { data: proxyData, error: proxyError } = await supabase.functions.invoke("image-proxy", {
            body: { imageUrl: permanentImageUrl, plantName: previewPlant.common_name },
          });
          if (proxyError) throw proxyError;
          if (proxyData?.publicUrl) {
            permanentImageUrl = proxyData.publicUrl;
            if (permanentImageUrl.includes("kong:8000")) {
              permanentImageUrl = permanentImageUrl.replace("http://kong:8000", "http://127.0.0.1:54321");
            }
          }
        } catch (proxyErr) {
          console.error("Proxy Failed:", proxyErr);
        }
      }

      // Three-way branch: Verdantly, AI/library, or Perenual.
      // AI/library plants follow Wave 3's shallow-fork pattern: when the
      // catalogue returned a `db_plant_id`, we record it as
      // `forked_from_plant_id` so the new row tracks the global.
      let skeletonPlant: Record<string, unknown>;
      if (isVerdantly) {
        skeletonPlant = {
          id:              Math.floor(Date.now() / 1000),
          home_id:         homeId,
          common_name:     previewPlant.common_name,
          scientific_name: previewPlant.scientific_name,
          thumbnail_url:   permanentImageUrl,
          source:          "verdantly",
          verdantly_id:    previewPlant.verdantly_id,
          growth_habit:    previewPlant.growth_habit ?? null,
          days_to_harvest_min: previewPlant.days_to_harvest_min ?? null,
          days_to_harvest_max: previewPlant.days_to_harvest_max ?? null,
          soil_ph_min:     previewPlant.soil_ph_min ?? null,
          soil_ph_max:     previewPlant.soil_ph_max ?? null,
          planting_instructions: previewPlant.planting_instructions ?? null,
        };
      } else if (isAi) {
        skeletonPlant = {
          id:              Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
          home_id:         homeId,
          common_name:     previewPlant.common_name,
          scientific_name: previewPlant.scientific_name ?? [],
          thumbnail_url:   permanentImageUrl,
          source:          "ai",
          perenual_id:     null,
          // Sync top-level AI care fields so TheShed / Plant Edit Modal can
          // render without re-fetching the care guide.
          watering:           previewPlant.watering ?? null,
          care_level:         previewPlant.care_level ?? null,
          cycle:              previewPlant.cycle ?? null,
          sunlight:           previewPlant.sunlight ?? [],
          description:        previewPlant.description ?? null,
          watering_min_days:  previewPlant.watering_min_days ?? null,
          watering_max_days:  previewPlant.watering_max_days ?? null,
          is_edible:          previewPlant.is_edible ?? false,
          is_toxic_pets:      previewPlant.is_toxic_pets ?? false,
          is_toxic_humans:    previewPlant.is_toxic_humans ?? false,
          attracts:           previewPlant.attracts ?? [],
        };
        if (previewPlant.db_plant_id != null) {
          skeletonPlant.forked_from_plant_id = previewPlant.db_plant_id;
          skeletonPlant.overridden_fields = [];
        }
      } else {
        skeletonPlant = {
          id:          Math.floor(Date.now() / 1000),
          home_id:     homeId,
          common_name: previewPlant.common_name,
          scientific_name: previewPlant.scientific_name,
          thumbnail_url: permanentImageUrl,
          source:      "api",
          perenual_id: String(previewPlant.perenual_id),
        };
      }

      const { data: savedPlant, error } = await supabase
        .from("plants")
        .insert([skeletonPlant])
        .select()
        .single();

      if (error) throw error;

      // For AI/library plants where the catalogue is known, seed
      // user_plant_ack at the global's current freshness_version so the
      // freshness chip doesn't fire on a freshly-added plant.
      if (isAi && previewPlant.db_plant_id != null) {
        const { data: userData } = await supabase.auth.getUser();
        const callerId = userData?.user?.id;
        if (callerId) {
          await supabase.from("user_plant_ack").upsert(
            {
              user_id: callerId,
              plant_id: previewPlant.db_plant_id,
              seen_freshness_version: previewPlant.freshness_version ?? 1,
              acked_at: new Date().toISOString(),
            },
            { onConflict: "user_id,plant_id" },
          );
        }
      }

      // Only Perenual rows get the auto-generated harvest schedule today
      // (it references "Perenual Database" in the description). AI/library
      // plants are excluded — their schedules come from the bulk-add flow.
      if (!isVerdantly && !isAi && previewPlant.harvest_season) {
        await supabase.from("plant_schedules").insert([{
          home_id:         homeId,
          plant_id:        savedPlant.id,
          title:           `${previewPlant.harvest_season} Harvest Season`,
          description:     "Auto-generated from Perenual Database",
          task_type:       "Harvesting",
          trigger_event:   "Planted",
          start_reference: "Seasonal: 09-01",
          end_reference:   "Seasonal: 11-30",
          start_offset_days: 0,
          end_offset_days:   0,
          frequency_days:  1,
          is_recurring:    true,
        }]);
      }

      toast.success(`${previewPlant.common_name} added to your Shed!`);
      onSuccess(savedPlant);
    } catch (err: any) {
      toast.error(err.message || "Failed to add plant.");
    } finally {
      setIsAdding(false);
    }
  };

  // 🚀 SSR Safety
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in`}>
      <div
        ref={modalRef}
        data-testid="plant-search-modal"
        className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-[3rem] shadow-2xl border border-rhozly-outline/20 overflow-hidden relative"
      >
        {isFetchingPreview && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-in fade-in">
            <Loader2 className="animate-spin text-rhozly-primary mb-2" size={32} />
            <p className="font-bold text-sm">Loading plant details...</p>
          </div>
        )}

        <div className="p-4 sm:p-8 pb-4 shrink-0 flex justify-between items-start border-b border-rhozly-outline/10">
          <div>
            <h3 className="text-3xl font-black flex items-center gap-3">
              <IconPlantDB className="text-rhozly-primary" /> Find a Plant
            </h3>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              Search the library, then add it to your Shed
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        {previewPlant ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar animate-in slide-in-from-right-4 flex flex-col">
            <button
              onClick={() => setPreviewPlant(null)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-primary mb-6 transition-colors"
            >
              <ChevronLeft size={16} /> Back to Results
            </button>

            <div className="flex-1">
              <ManualPlantCreation initialData={previewPlant} isReadOnly={true} />
            </div>

            <div className="mt-8 pt-4 border-t border-rhozly-outline/10 shrink-0">
              <button
                data-testid="plant-search-add-to-shed"
                onClick={handleAddToShed}
                disabled={isAdding}
                className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isAdding ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Plus size={20} /> Add {previewPlant.common_name} to My Shed
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 pt-4 custom-scrollbar">
            <PlantSearch
              homeId={homeId}
              autoFocus
              showFilters
              allowPreview
              placeholder="Search any plant by name…"
              initialQuery={initialSearchTerm}
              gates={{
                // Verdantly is free for all; Perenual self-gates inside searchAllProviders.
                canSearchExternal: true,
                canCreateWithAI: isAiEnabled,
              }}
              onSelect={handleSelect}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
