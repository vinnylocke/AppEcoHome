import React, { useState } from "react";
import {
  X,
  Search,
  Loader2,
  Database,
  Lock,
  Plus,
  ChevronLeft,
  Droplets,
  Sun,
  Info,
} from "lucide-react";
import { PerenualService } from "../lib/perenualService";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import ManualPlantCreation from "./ManualPlantCreation"; // 🚀 THE MISSING IMPORT!

interface Props {
  homeId: string;
  isPremium: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PlantSearchModal({
  homeId,
  isPremium,
  onClose,
  onSuccess,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // New State for the Preview Flow
  const [previewPlant, setPreviewPlant] = useState<any | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setPreviewPlant(null); // Reset preview if searching again
    try {
      const data = await PerenualService.searchPlants(query);
      setResults(data);
    } catch (err) {
      toast.error("Search failed. Check your connection.");
    } finally {
      setIsSearching(false);
    }
  };

  // 1. Fetch details just to PREVIEW
  const handlePreviewPlant = async (perenualId: number) => {
    setIsFetchingPreview(true);
    try {
      const fullPlantData = await PerenualService.getPlantDetails(perenualId);
      setPreviewPlant(fullPlantData);
    } catch (err) {
      toast.error("Failed to load plant details.");
    } finally {
      setIsFetchingPreview(false);
    }
  };

  // 2. Commit the previewed plant to the database (SKELETON ONLY)
  const handleAddToShed = async () => {
    if (!previewPlant) return;
    setIsAdding(true);

    try {
      const manualId = Math.floor(Date.now() / 1000);

      // 🚀 COMPLIANCE FIX: Only save basic "Bookmark" data to the permanent database
      const skeletonPlant = {
        id: manualId,
        home_id: homeId,
        common_name: previewPlant.common_name,
        scientific_name: previewPlant.scientific_name,
        thumbnail_url: previewPlant.thumbnail_url || previewPlant.image_url,
        source: "api",
        perenual_id: previewPlant.perenual_id,
      };

      const { data: savedPlant, error } = await supabase
        .from("plants")
        .insert([skeletonPlant])
        .select()
        .single();

      if (error) throw error;

      // 🚀 AUTO-GENERATE SCHEDULES: We can still use the transient 'previewPlant' data to build our own rules!
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

      toast.success(`${previewPlant.common_name} added to your Shed!`, {
        id: "add-api",
      });
      onSuccess();
    } catch (err) {
      toast.error("Failed to add plant.", { id: "add-api" });
    } finally {
      setIsAdding(false);
    }
  };

  // 🔒 PREMIUM GATE UI
  if (!isPremium) {
    return (
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
      </div>
    );
  }

  // 🌍 STANDARD SEARCH & PREVIEW UI
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
      <div className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-[3rem] shadow-2xl border border-rhozly-outline/20 overflow-hidden relative">
        {/* Loading Overlay for Detail Fetch */}
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

        {/* 🚀 If viewing a PREVIEW, show the fully mapped Care Guide! */}
        {previewPlant ? (
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar animate-in slide-in-from-right-4 flex flex-col">
            <button
              onClick={() => setPreviewPlant(null)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-primary mb-6 transition-colors"
            >
              <ChevronLeft size={16} /> Back to Results
            </button>

            <div className="flex-1">
              {/* REUSING YOUR EXACT COMPONENT IN READ-ONLY MODE */}
              <ManualPlantCreation
                initialData={previewPlant}
                isReadOnly={true}
              />
            </div>

            {/* Sticky bottom button to add to shed */}
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
          /* Otherwise, show the Search Form & Results List */
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
                        {plant.default_image?.thumbnail ? (
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
                      onClick={() => handlePreviewPlant(plant.id)}
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
    </div>
  );
}
