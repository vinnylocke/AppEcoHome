import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  ArrowLeft,
  Home,
  Sun,
  MapPin,
  Trash2,
  CheckSquare,
  Loader2,
} from "lucide-react";
import AreaDetails from "./AreaDetails";
import { ConfirmModal } from "./ConfirmModal";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

interface LocationPageProps {
  location: any;
  onBack: () => void;
}

export const LocationPage: React.FC<LocationPageProps> = ({
  location,
  onBack,
}) => {
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Environment Toggle State
  const [isOutside, setIsOutside] = useState(location.is_outside);
  const [isUpdatingEnv, setIsUpdatingEnv] = useState(false);

  // Zoomed-in Area State
  const [focusedArea, setFocusedArea] = useState<any | null>(null);

  // Delete Area State
  const [areaToDelete, setAreaToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAreas = async () => {
    setLoading(true);
    try {
      // Clever query: Fetches areas AND counts how many plants are inside them!
      const { data, error } = await supabase
        .from("areas")
        .select("*, inventory_items(count)")
        .eq("location_id", location.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setAreas(data || []);
    } catch (error: any) {
      Logger.error("Failed to load areas", error, { locationId: location.id });
      toast.error("Could not load areas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAreas();
  }, [location.id]);

  const handleToggleEnvironment = async () => {
    setIsUpdatingEnv(true);
    const newEnv = !isOutside;

    // Optimistic UI
    setIsOutside(newEnv);

    try {
      const { error } = await supabase
        .from("locations")
        .update({ is_outside: newEnv })
        .eq("id", location.id);

      if (error) throw error;
      Logger.success(`Location is now ${newEnv ? "Outside" : "Inside"}`);
    } catch (error: any) {
      // Revert UI if it fails
      setIsOutside(!newEnv);
      Logger.error("Failed to update environment", error, {
        locationId: location.id,
      });
      toast.error("Could not update location setting.");
    } finally {
      setIsUpdatingEnv(false);
    }
  };

  const handleConfirmDeleteArea = async () => {
    if (!areaToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("areas")
        .delete()
        .eq("id", areaToDelete.id);
      if (error) throw error;

      Logger.success("Area deleted successfully");
      setAreas(areas.filter((a) => a.id !== areaToDelete.id)); // Optimistic UI
    } catch (error: any) {
      Logger.error("Failed to delete area", error, { areaId: areaToDelete.id });
      toast.error("Could not delete this area.");
    } finally {
      setIsDeleting(false);
      setAreaToDelete(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* 1. Header & Environment Toggle (Always Visible) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-white rounded-xl transition-all shadow-sm"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-3xl font-black font-display text-rhozly-on-surface tracking-tight">
              {location.name}
            </h2>
            <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              {location.placement || "Location Overview"}
            </p>
          </div>
        </div>

        <button
          disabled={isUpdatingEnv}
          onClick={handleToggleEnvironment}
          className={`px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50
            ${!isOutside ? "bg-blue-50 text-blue-600 hover:bg-blue-100" : "bg-orange-50 text-orange-600 hover:bg-orange-100"}`}
        >
          {!isOutside ? (
            <Home className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
          {!isOutside ? "Inside Environment" : "Outside Environment"}
        </button>
      </div>

      {/* 2. Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* Left Side: Dynamic Area Rendering */}
        <div className="lg:col-span-8">
          {focusedArea ? (
            // Show the detailed Plant list if an area is clicked
            <AreaDetails
              area={focusedArea}
              onClose={() => {
                setFocusedArea(null);
                fetchAreas(); // Refresh areas list to get updated plant counts!
              }}
            />
          ) : (
            // Show the Area Grid if nothing is focused
            <div className="space-y-6">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-display font-black text-rhozly-on-surface/60 uppercase tracking-widest text-sm">
                  Areas
                </h3>
              </div>

              {loading ? (
                <div className="py-20 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-rhozly-primary" />
                </div>
              ) : areas.length === 0 ? (
                <div className="p-12 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 text-rhozly-on-surface/50 font-bold text-sm">
                  No areas created yet. Head to Location Management to create
                  some!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {areas.map((area) => {
                    const plantCount = area.inventory_items?.[0]?.count || 0;
                    return (
                      <div
                        key={area.id}
                        onClick={() => setFocusedArea(area)}
                        className="bg-white rounded-3xl p-6 border border-rhozly-outline/10 shadow-sm cursor-pointer group hover:border-rhozly-primary/30 hover:shadow-md transition-all relative overflow-hidden"
                      >
                        {/* Hover Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-br from-rhozly-primary/0 to-rhozly-primary/[0.03] opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="relative z-10 flex justify-between items-start">
                          <div className="space-y-4">
                            <div className="bg-rhozly-primary/5 p-3 rounded-2xl inline-block group-hover:bg-rhozly-primary/10 transition-colors">
                              <MapPin className="w-6 h-6 text-rhozly-primary" />
                            </div>
                            <div>
                              <h4 className="text-xl font-display font-black text-rhozly-on-surface">
                                {area.name}
                              </h4>
                              <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                                {plantCount} Plants
                              </p>
                            </div>
                          </div>

                          {/* Delete Button - stops event propagation so it doesn't open the area */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAreaToDelete(area);
                            }}
                            className="p-2 text-rhozly-on-surface/20 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Tasks Panel (Always Visible) */}
        <div className="lg:col-span-4">
          <div className="bg-rhozly-surface-lowest rounded-3xl p-6 border border-rhozly-outline/30 shadow-sm h-full min-h-[400px]">
            <div className="flex items-center gap-3 mb-6 border-b border-rhozly-outline/10 pb-4">
              <div className="bg-rhozly-primary/10 p-2 rounded-xl">
                <CheckSquare className="w-5 h-5 text-rhozly-primary" />
              </div>
              <h3 className="font-display font-black text-rhozly-on-surface text-lg">
                Location Tasks
              </h3>
            </div>
            <div className="text-center py-10 text-rhozly-on-surface/40 font-bold text-sm">
              Task list component goes here
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRM DELETE MODAL FOR AREAS */}
      <ConfirmModal
        isOpen={areaToDelete !== null}
        isLoading={isDeleting}
        onClose={() => setAreaToDelete(null)}
        onConfirm={handleConfirmDeleteArea}
        title="Delete Area"
        description={`Are you sure you want to permanently delete "${areaToDelete?.name}"? All plants inside this area will also be removed. This cannot be undone.`}
        confirmText="Delete Area"
        isDestructive={true}
      />
    </div>
  );
};
