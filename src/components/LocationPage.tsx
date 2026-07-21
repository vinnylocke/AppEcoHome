import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  ArrowLeft,
  Home,
  Sun,
  MapPin,
  Trash2,
  CheckSquare,
  Loader2,
  Plus,
} from "lucide-react";
import AreaDetails from "./AreaDetails";
import AddAreaWizard from "./area/AddAreaWizard";
import { ConfirmModal } from "./ConfirmModal";
import { usePermissions } from "../context/HomePermissionsContext";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import TaskList from "./TaskList";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface LocationPageProps {
  location: any;
  aiEnabled?: boolean;
  perenualEnabled?: boolean;
}

export const LocationPage: React.FC<LocationPageProps> = ({
  location,
  aiEnabled = false,
  perenualEnabled = false,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const areaIdParam = searchParams.get("areaId");
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();
  // Stage 5: the drill-in is the edit host — gate its mutations (RLS gates only
  // home membership, not the spatial keys, so client can() is the sole guard;
  // this closed a real leak: env-toggle + area-delete were ungated).
  const { can } = usePermissions();
  const [wizardOpen, setWizardOpen] = useState(false);

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

  const [taskRefreshKey, setTaskRefreshKey] = useState(0);

  // 🧠 LIVE AI SYNC: Update the AI on the overall Location and active Environment
  useEffect(() => {
    setPageContext({
      action: focusedArea
        ? `Inspecting Area: ${focusedArea.name}`
        : `Browsing Location: ${location.name}`,
      locationContext: {
        name: location.name,
        environment: isOutside ? "Outdoor" : "Indoor",
        totalAreas: areas.length,
        areaNames: areas.map((a) => a.name),
      },
      focusedArea: focusedArea
        ? {
            name: focusedArea.name,
            plantCount: focusedArea.inventory_items?.[0]?.count || 0,
            metrics: {
              ph: focusedArea.medium_ph,
              lux: focusedArea.light_intensity_lux,
              medium: focusedArea.growing_medium,
            },
          }
        : null,
    });

    // Clean up when leaving the page or changing locations
    return () => setPageContext(null);
  }, [location, areas, isOutside, focusedArea, setPageContext]);

  const AREAS_CACHE_TTL = 5 * 60 * 1000;

  const fetchAreas = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("areas")
        .select("*, inventory_items(count)")
        .eq("location_id", location.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setAreas(data || []);
      sessionStorage.setItem(
        `areas_cache_${location.id}`,
        JSON.stringify({ areas: data || [], ts: Date.now() }),
      );
    } catch (error: any) {
      Logger.error("Failed to load areas", error, { locationId: location.id });
      if (!background) toast.error("Could not load areas.");
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(`areas_cache_${location.id}`);
    if (raw) {
      try {
        const { areas: cached, ts } = JSON.parse(raw);
        if (Date.now() - ts < AREAS_CACHE_TTL) {
          setAreas(cached);
          setLoading(false);
          fetchAreas(true);
          return;
        }
      } catch {}
    }
    fetchAreas();
  }, [location.id]);

  useEffect(() => {
    if (areaIdParam && areas.length > 0) {
      const target = areas.find((a) => String(a.id) === areaIdParam);
      if (target) setFocusedArea(target);
    }
  }, [areaIdParam, areas]);

  const handleToggleEnvironment = async () => {
    if (!can("locations.edit")) {
      toast.error("You don't have permission to change this location.");
      return;
    }
    setIsUpdatingEnv(true);
    const newEnv = !isOutside;

    setIsOutside(newEnv);

    try {
      const { error } = await supabase
        .from("locations")
        .update({ is_outside: newEnv })
        .eq("id", location.id);

      if (error) throw error;
      Logger.success(`Location is now ${newEnv ? "Outside" : "Inside"}`);
    } catch (error: any) {
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
    if (!can("areas.delete")) {
      toast.error("You don't have permission to delete areas.");
      setAreaToDelete(null);
      return;
    }
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("areas")
        .delete()
        .eq("id", areaToDelete.id);
      if (error) throw error;

      Logger.success("Area deleted successfully");
      setAreas(areas.filter((a) => a.id !== areaToDelete.id));
    } catch (error: any) {
      Logger.error("Failed to delete area", error, { areaId: areaToDelete.id });
      toast.error("Could not delete this area.");
    } finally {
      setIsDeleting(false);
      setAreaToDelete(null);
    }
  };

  const handleDataRefresh = () => {
    fetchAreas();
    setTaskRefreshKey((prev) => prev + 1);
  };

  const handleAreaCreated = () => {
    setWizardOpen(false);
    fetchAreas();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            aria-label="Back to dashboard"
            className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-white rounded-xl transition-all shadow-sm"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-3xl font-black font-display text-rhozly-on-surface tracking-tight">
              {location.name}
            </h2>
            {focusedArea ? (
              <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                {location.name}{" "}
                <span className="text-rhozly-on-surface/20">›</span>{" "}
                {focusedArea.name}
              </p>
            ) : (
              <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                {location.placement || "Location Overview"}
              </p>
            )}
          </div>
        </div>

        {can("locations.edit") ? (
          <button
            disabled={isUpdatingEnv}
            onClick={handleToggleEnvironment}
            className={`px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50
              ${!isOutside ? "bg-rhozly-primary/10 text-rhozly-primary hover:bg-rhozly-primary/20" : "bg-rhozly-secondary/10 text-rhozly-secondary hover:bg-rhozly-secondary/20"}`}
          >
            {!isOutside ? (
              <Home className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
            {!isOutside ? "Inside Environment" : "Outside Environment"}
          </button>
        ) : (
          // Read-only environment badge for members/viewers who can't edit.
          <span className="px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 whitespace-nowrap bg-rhozly-surface-low text-rhozly-on-surface-variant">
            {!isOutside ? <Home className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            {!isOutside ? "Inside" : "Outside"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        <div className="lg:col-span-7 xl:col-span-8">
          {focusedArea ? (
            <AreaDetails
              homeId={location.home_id}
              area={focusedArea}
              aiEnabled={aiEnabled}
              perenualEnabled={perenualEnabled}
              onClose={() => {
                setFocusedArea(null);
                navigate(`/dashboard?locationId=${location.id}`);
              }}
              onTasksUpdated={handleDataRefresh}
              onAreaUpdated={fetchAreas}
              isOutside={isOutside}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-display font-black text-rhozly-on-surface/60 uppercase tracking-widest text-sm">
                  Areas
                </h3>
                {can("areas.create") && areas.length > 0 && (
                  <button
                    type="button"
                    data-testid="location-add-area-btn"
                    onClick={() => setWizardOpen(true)}
                    className="flex items-center gap-1 text-[11px] font-black text-rhozly-primary bg-rhozly-primary/5 px-2.5 py-1 rounded-full can-hover:hover:bg-rhozly-primary/10 active:scale-[0.97] transition"
                  >
                    <Plus size={12} /> Add area
                  </button>
                )}
              </div>

              {loading ? (
                <div className="py-20 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-rhozly-primary" />
                </div>
              ) : areas.length === 0 ? (
                <div className="p-12 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 text-rhozly-on-surface/60 font-bold text-sm space-y-4">
                  <p>No areas yet — areas are the beds, borders and pots inside this location.</p>
                  {can("areas.create") ? (
                    // Stage 5: a REAL add-area button (was a dead "go to Settings ›
                    // Location Management" instruction that pointed nowhere clickable).
                    <button
                      type="button"
                      data-testid="location-add-area-empty-btn"
                      onClick={() => setWizardOpen(true)}
                      className="inline-flex items-center gap-2 bg-rhozly-primary text-white px-5 py-2.5 rounded-2xl font-black text-sm shadow-card can-hover:hover:opacity-90 active:scale-[0.98] transition"
                    >
                      <Plus size={16} /> Add your first area
                    </button>
                  ) : (
                    <p className="text-rhozly-on-surface/45 font-medium">Ask a home admin to add areas here.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {areas.map((area) => {
                    const plantCount = area.inventory_items?.[0]?.count || 0;
                    return (
                      <div
                        key={area.id}
                        onClick={() => {
                          setFocusedArea(area);
                          navigate(`/dashboard?locationId=${location.id}&areaId=${area.id}`);
                        }}
                        className="bg-white rounded-3xl p-6 border border-rhozly-outline/10 shadow-sm cursor-pointer group hover:border-rhozly-primary/30 hover:shadow-md transition-all relative overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-rhozly-primary/0 to-rhozly-primary/[0.03]" />

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

                          {can("areas.delete") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAreaToDelete(area);
                              }}
                              aria-label={`Delete area ${area.name}`}
                              className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/20 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 xl:col-span-4">
          <div className="bg-rhozly-surface-lowest rounded-3xl p-6 border border-rhozly-outline/30 shadow-sm h-full min-h-[500px] flex flex-col">
            <div className="flex items-center gap-3 mb-6 border-b border-rhozly-outline/10 pb-4">
              <div className="bg-rhozly-primary/10 p-2 rounded-xl">
                <CheckSquare className="w-5 h-5 text-rhozly-primary" />
              </div>
              <div>
                <h3 className="font-display font-black text-rhozly-on-surface text-lg leading-tight">
                  {focusedArea ? focusedArea.name : location.name}
                </h3>
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">
                  Tasks Today
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 relative">
              <TaskList
                key={taskRefreshKey}
                homeId={location.home_id}
                locationId={!focusedArea ? location.id : undefined}
                areaId={focusedArea ? focusedArea.id : undefined}
              />
            </div>
          </div>
        </div>
      </div>

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

      {/* Stage 5: the Add-Area wizard now lives on the drill-in (was only
          reachable from /management). The `can("areas.create")`-gated buttons
          above open it; it self-portals. */}
      {wizardOpen && can("areas.create") && (
        <AddAreaWizard
          homeId={location.home_id}
          location={{ id: location.id, name: location.name }}
          aiEnabled={aiEnabled}
          isPremium={perenualEnabled}
          onClose={() => setWizardOpen(false)}
          onCreated={handleAreaCreated}
        />
      )}
    </div>
  );
};
