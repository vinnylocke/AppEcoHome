import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom"; // 🚀 IMPORT THE PORTAL
import {
  X,
  Search,
  Loader2,
  Database,
  Lock,
  Plus,
  ChevronLeft,
} from "lucide-react";
import { PerenualService } from "../lib/perenualService";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import ManualPlantCreation from "./ManualPlantCreation";

import { usePlantDoctor } from "../context/PlantDoctorContext";

interface Props {
  homeId: string;
  isPremium: boolean;
  onClose: () => void;
  onSuccess: (newPlant?: any) => void;
  initialSearchTerm?: string;
}

export default function PlantSearchModal({
  homeId,
  isPremium,
  onClose,
  onSuccess,
  initialSearchTerm,
}: Props) {
  const { setPageContext } = usePlantDoctor();

  const [query, setQuery] = useState(initialSearchTerm || "");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [previewPlant, setPreviewPlant] = useState<any | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    setPageContext({
      action: previewPlant
        ? "Previewing Global Encyclopedia Entry"
        : "Searching Global Plant Database",
      searchContext: {
        currentQuery: query,
        hasResults: results.length > 0,
        resultCount: results.length,
      },
      previewedPlant: previewPlant
        ? {
            commonName: previewPlant.common_name,
            scientificName: previewPlant.scientific_name?.[0],
            type: previewPlant.type,
            cycle: previewPlant.cycle,
            watering: previewPlant.watering,
            sunlight: previewPlant.sunlight,
          }
        : null,
    });

    return () => setPageContext(null);
  }, [query, results, previewPlant, setPageContext]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setPreviewPlant(null);
    try {
      const data = await PerenualService.searchPlants(searchQuery);
      setResults(data);
    } catch (err) {
      toast.error("Search failed. Check your connection.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const hasAutoSearched = useRef(false);

  useEffect(() => {
    if (initialSearchTerm && isPremium && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      performSearch(initialSearchTerm);
    }
  }, [initialSearchTerm, isPremium]);

  const handlePreviewPlant = async (searchResultPlant: any) => {
    setIsFetchingPreview(true);
    try {
      const fullPlantData = await PerenualService.getPlantDetails(
        searchResultPlant.id,
      );

      const getValidImage = (...urls: any[]) => {
        return (
          urls.find(
            (u) => u && typeof u === "string" && !u.includes("upgrade_access"),
          ) || ""
        );
      };

      const safeImage = getValidImage(
        fullPlantData.image_url,
        fullPlantData.thumbnail_url,
        searchResultPlant.default_image?.original_url,
        searchResultPlant.default_image?.regular_url,
        searchResultPlant.default_image?.thumbnail,
      );

      setPreviewPlant({
        ...fullPlantData,
        image_url: safeImage,
        thumbnail_url: safeImage,
      });
    } catch (err) {
      toast.error("Failed to load plant details.");
    } finally {
      setIsFetchingPreview(false);
    }
  };

  const handleAddToShed = async () => {
    if (!previewPlant) return;
    setIsAdding(true);

    try {
      const pId = String(previewPlant.perenual_id || previewPlant.id);

      const { data: existingPlant, error: checkError } = await supabase
        .from("plants")
        .select("id")
        .eq("home_id", homeId)
        .eq("perenual_id", pId)
        .maybeSingle();

      if (checkError) {
        throw new Error("Could not verify if plant exists. Try again.");
      }

      if (existingPlant) {
        toast.error(`${previewPlant.common_name} is already in your Shed!`, {
          icon: "🚫",
        });
        setIsAdding(false);
        return;
      }

      let permanentImageUrl =
        previewPlant.image_url || previewPlant.thumbnail_url || "";

      if (permanentImageUrl) {
        try {
          const { data: proxyData, error: proxyError } =
            await supabase.functions.invoke("image-proxy", {
              body: {
                imageUrl: permanentImageUrl,
                plantName: previewPlant.common_name,
              },
            });

          if (proxyError) throw proxyError;

          if (proxyData?.publicUrl) {
            permanentImageUrl = proxyData.publicUrl;

            if (permanentImageUrl.includes("kong:8000")) {
              permanentImageUrl = permanentImageUrl.replace(
                "http://kong:8000",
                "http://127.0.0.1:54321",
              );
            }
          }
        } catch (proxyErr) {
          console.error("❌ Proxy Failed:", proxyErr);
        }
      }

      const manualId = Math.floor(Date.now() / 1000);
      const skeletonPlant = {
        id: manualId,
        home_id: homeId,
        common_name: previewPlant.common_name,
        scientific_name: previewPlant.scientific_name,
        thumbnail_url: permanentImageUrl,
        source: "api",
        perenual_id: pId,
      };

      const { data: savedPlant, error } = await supabase
        .from("plants")
        .insert([skeletonPlant])
        .select()
        .single();

      if (error) throw error;

      if (previewPlant.harvest_season) {
        await supabase.from("plant_schedules").insert([
          {
            home_id: homeId,
            plant_id: savedPlant.id,
            title: `${previewPlant.harvest_season} Harvest Season`,
            description: `Auto-generated from Perenual Database`,
            task_type: "Harvesting",
            trigger_event: "Planted",
            start_reference: `Seasonal: 09-01`,
            end_reference: `Seasonal: 11-30`,
            start_offset_days: 0,
            end_offset_days: 0,
            frequency_days: 1,
            is_recurring: true,
          },
        ]);
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

  // 🚀 LOGIC FOR PREMIUM LOCK
  if (!isPremium) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
        <div className="bg-rhozly-surface-lowest w-full max-w-md p-8 rounded-[3rem] shadow-2xl border border-rhozly-outline/20 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-rhozly-surface-low rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
          >
            <X size={20} />
          </button>
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-600">
            <Lock size={32} />
          </div>
          <h3 className="text-2xl font-black mb-2">Global Database Access</h3>
          <p className="text-sm font-bold text-rhozly-on-surface/60 mb-8">
            Upgrade to Premium to instantly import detailed care guides, images,
            and watering benchmarks for over 10,000 species.
          </p>
          <button className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-xl hover:scale-105 transition-transform">
            Upgrade Now
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  // 🚀 MAIN MODAL PORTAL
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
      <div className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-[3rem] shadow-2xl border border-rhozly-outline/20 overflow-hidden relative">
        {isFetchingPreview && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-in fade-in">
            <Loader2
              className="animate-spin text-rhozly-primary mb-2"
              size={32}
            />
            <p className="font-bold text-sm">Loading encyclopedia data...</p>
          </div>
        )}

        <div className="p-8 pb-4 shrink-0 flex justify-between items-start border-b border-rhozly-outline/10">
          <div>
            <h3 className="text-3xl font-black flex items-center gap-3">
              <Database className="text-rhozly-primary" /> Plant Search
            </h3>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              Powered by Perenual API
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        {previewPlant ? (
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar animate-in slide-in-from-right-4 flex flex-col">
            <button
              onClick={() => setPreviewPlant(null)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-primary mb-6 transition-colors"
            >
              <ChevronLeft size={16} /> Back to Results
            </button>

            <div className="flex-1">
              <ManualPlantCreation
                initialData={previewPlant}
                isReadOnly={true}
              />
            </div>

            <div className="mt-8 pt-4 border-t border-rhozly-outline/10 shrink-0">
              <button
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
          <>
            <div className="p-8 pb-4 shrink-0">
              <form
                onSubmit={handleSearch}
                className="relative flex items-center"
              >
                <input
                  type="text"
                  placeholder="Search by common or scientific name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-6 pr-14 py-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
                />
                <button
                  type="submit"
                  className="absolute right-2 p-2 bg-rhozly-primary text-white rounded-xl hover:scale-105 transition-transform"
                >
                  <Search size={20} />
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar space-y-4">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-40 opacity-50">
                  <Loader2
                    className="animate-spin text-rhozly-primary mb-4"
                    size={32}
                  />
                  <p className="font-bold text-sm">Searching Database...</p>
                </div>
              ) : results.length > 0 ? (
                results.map((plant: any) => (
                  <div
                    key={plant.id}
                    className="bg-white p-4 rounded-2xl border border-rhozly-outline/10 shadow-sm flex items-center justify-between group hover:border-rhozly-primary/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-xl bg-rhozly-primary/5 overflow-hidden shrink-0">
                        {plant.default_image?.thumbnail &&
                        !plant.default_image?.thumbnail.includes(
                          "upgrade_access",
                        ) ? (
                          <img
                            src={plant.default_image.thumbnail}
                            alt={plant.common_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-rhozly-on-surface/20">
                            <Database size={24} />
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-lg text-rhozly-on-surface leading-tight">
                          {plant.common_name}
                        </h4>
                        <p className="text-xs font-bold text-rhozly-on-surface/50 italic">
                          {plant.scientific_name?.[0]}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handlePreviewPlant(plant)}
                      className="px-4 py-2 bg-rhozly-primary/10 text-rhozly-primary font-black text-xs uppercase tracking-widest rounded-xl hover:bg-rhozly-primary hover:text-white transition-all active:scale-95"
                    >
                      View
                    </button>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                  <Search
                    size={48}
                    className="mb-4 text-rhozly-on-surface/50"
                  />
                  <p className="font-black text-lg">Find Any Plant</p>
                  <p className="text-sm font-bold mt-1">
                    Search the global database to auto-fill your care guides.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
