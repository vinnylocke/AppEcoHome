import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom"; // 🚀 IMPORT THE PORTAL
import { X, Droplets, Calendar, Database, Loader2, RefreshCw, BookOpen, Sun, Sprout, Activity, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantScheduleTab from "./PlantScheduleTab";
import PlantGuidesTab from "./PlantGuidesTab";
import LightTab from "./LightTab";
import CompanionPlantsTab from "./CompanionPlantsTab";
import { getProviderPlantDetails } from "../lib/plantProvider";
import { getProviderLabel } from "../lib/verdantlyUtils";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface PlantEditModalProps {
  homeId: string;
  plant: any;
  onSave: (updatedData: any) => void;
  onClose: () => void;
  isSaving?: boolean;
  aiEnabled?: boolean;
  isPremium?: boolean;
}

export default function PlantEditModal({
  homeId,
  plant,
  onSave,
  onClose,
  isSaving,
  aiEnabled = false,
  isPremium = false,
}: PlantEditModalProps) {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("care");
  const [fullPlantData, setFullPlantData] = useState<any>(plant);
  const [isFetchingApiData, setIsFetchingApiData] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [loadSuccess, setLoadSuccess] = useState(false);
  const liveRegionRef = useRef<HTMLSpanElement>(null);

  // Contextual at-a-glance data: instance count, areas covered, latest lux, open tasks
  const [glance, setGlance] = useState<{
    instances: number;
    areas: number;
    openTasks: number;
    overdueTasks: number;
    latestLux: number | null;
    latestLuxAreaName: string | null;
    activeAilments: number;
  } | null>(null);

  useEffect(() => {
    if (!homeId || !plant?.id) return;
    let cancelled = false;
    (async () => {
      // Inventory items for this plant — gives us instance count + areas
      const { data: items } = await supabase
        .from("inventory_items")
        .select("id, area_id, areas(name)")
        .eq("home_id", homeId)
        .eq("plant_id", plant.id);
      if (cancelled) return;
      const instanceIds = (items ?? []).map((i: any) => i.id);
      const areaIds = new Set((items ?? []).map((i: any) => i.area_id).filter(Boolean));

      // Open tasks across these instances
      const todayStr = new Date().toISOString().split("T")[0];
      const [tasksRes, ailmentRes, luxRes] = await Promise.all([
        instanceIds.length === 0
          ? Promise.resolve({ data: [] })
          : supabase
              .from("tasks")
              .select("id, due_date")
              .in("inventory_item_id", instanceIds)
              .neq("status", "Completed")
              .neq("status", "Skipped"),
        instanceIds.length === 0
          ? Promise.resolve({ count: 0 })
          : supabase
              .from("plant_instance_ailments")
              .select("id", { count: "exact", head: true })
              .eq("home_id", homeId)
              .eq("status", "active")
              .in("plant_instance_id", instanceIds),
        areaIds.size === 0
          ? Promise.resolve({ data: [] })
          : supabase
              .from("area_lux_readings")
              .select("lux_value, area_id, recorded_at, areas(name)")
              .in("area_id", Array.from(areaIds))
              .order("recorded_at", { ascending: false })
              .limit(1),
      ]);
      if (cancelled) return;

      const tasks = (tasksRes as any).data ?? [];
      const overdueTasks = tasks.filter((t: any) => t.due_date < todayStr).length;
      const luxRow = ((luxRes as any).data ?? [])[0];

      setGlance({
        instances: instanceIds.length,
        areas: areaIds.size,
        openTasks: tasks.length,
        overdueTasks,
        latestLux: luxRow?.lux_value ?? null,
        latestLuxAreaName: luxRow?.areas?.name ?? null,
        activeAilments: (ailmentRes as any).count ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, [homeId, plant?.id]);

  const tabs = [
    { id: "care", label: "Care Guide", icon: Droplets },
    { id: "schedules", label: "Automations", icon: Calendar },
    { id: "light", label: "Light", icon: Sun },
    { id: "guides", label: "Guides", icon: BookOpen },
    { id: "companions", label: "Companions", icon: Sprout },
  ];

  // 🧠 LIVE AI SYNC: Update the AI on the Master Plant Template being viewed/edited
  useEffect(() => {
    setPageContext({
      action: "Managing Master Plant Data (The Shed)",
      activeTab: activeTab,
      plantTemplate: {
        name: fullPlantData?.common_name,
        source: plant.source, // 'api' or 'manual'
        careLevel: fullPlantData?.care_level,
        cycle: fullPlantData?.cycle,
        wateringNeeds: fullPlantData?.watering,
        sunlightNeeds: fullPlantData?.sunlight,
      },
      isEditingRestricted: plant.source === "api" || plant.source === "verdantly",
    });

    // Cleanup on close
    return () => setPageContext(null);
  }, [fullPlantData, activeTab, plant.source, setPageContext]);

  const fetchApiDetails = async () => {
    if (
      (plant.source === "api" && plant.perenual_id) ||
      (plant.source === "verdantly" && plant.verdantly_id)
    ) {
      setIsFetchingApiData(true);
      setFetchError(false);
      setLoadSuccess(false);
      try {
        const apiData = await getProviderPlantDetails({
          source: plant.source,
          perenual_id: plant.perenual_id ? Number(plant.perenual_id) : null,
          verdantly_id: plant.verdantly_id ?? null,
        });

        // Perenual images are Wasabi signed URLs that expire after 24h.
        // If the stored URL is missing or a Wasabi URL, fetch a fresh one directly.
        const isStale = (url?: string) =>
          !url || url.includes("wasabisys.com") || url.includes("X-Amz-");

        let imageUrl = plant.thumbnail_url;
        if (isStale(imageUrl)) {
          try {
            const { data: fresh } = await supabase.functions.invoke("perenual-proxy", {
              body: { action: "details", id: plant.perenual_id },
            });
            imageUrl =
              fresh?.default_image?.regular_url ||
              fresh?.default_image?.thumbnail ||
              apiData.image_url ||
              "";
          } catch {
            imageUrl = apiData.image_url || "";
          }
        }

        setFullPlantData({
          ...plant,
          ...apiData,
          thumbnail_url: imageUrl,
          image_url: imageUrl,
        });
        setLoadSuccess(true);
        setTimeout(() => setLoadSuccess(false), 3000);
      } catch (error) {
        setFetchError(true);
        toast.error("Failed to load live care guide.");
      } finally {
        setIsFetchingApiData(false);
      }
    } else {
      setFullPlantData(plant);
    }
  };

  useEffect(() => {
    fetchApiDetails();
  }, [plant]);

  // 🚀 SSR Safety Check
  if (typeof document === "undefined") return null;

  // 🚀 PORTAL WRAPPER
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest w-full max-w-3xl h-[90vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden">
        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-3 shrink-0">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h3 className="text-2xl sm:text-3xl font-black text-rhozly-on-surface leading-tight">
                {plant.common_name}
              </h3>
              <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest mt-1">
                Care &amp; Management
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center p-3 bg-rhozly-surface-low rounded-2xl hover:bg-rhozly-surface hover:scale-110 transition-all"
            >
              <X size={24} />
            </button>
          </div>

          {/* At-a-glance contextual strip */}
          {glance && glance.instances > 0 && (
            <div
              data-testid="plant-edit-glance-strip"
              className="mt-4 flex items-center gap-2 flex-wrap"
            >
              <button
                onClick={() => navigate("/garden-layout")}
                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black hover:bg-emerald-100 transition-colors"
                aria-label={`${glance.instances} planted in ${glance.areas} areas — view on layout`}
              >
                <Sprout size={12} />
                {glance.instances} planted · {glance.areas} area{glance.areas !== 1 ? "s" : ""}
              </button>
              {glance.overdueTasks > 0 ? (
                <button
                  onClick={() => { setActiveTab("schedules"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black hover:bg-rose-100 transition-colors"
                  aria-label={`${glance.overdueTasks} overdue tasks`}
                >
                  ⏰ {glance.overdueTasks} overdue
                </button>
              ) : glance.openTasks > 0 ? (
                <button
                  onClick={() => { setActiveTab("schedules"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-black hover:bg-sky-100 transition-colors"
                  aria-label={`${glance.openTasks} upcoming tasks`}
                >
                  <Calendar size={12} />
                  {glance.openTasks} upcoming task{glance.openTasks !== 1 ? "s" : ""}
                </button>
              ) : null}
              {glance.activeAilments > 0 && (
                <button
                  onClick={() => navigate("/shed?tab=watchlist")}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-black hover:bg-amber-100 transition-colors"
                  aria-label={`${glance.activeAilments} active ailments`}
                >
                  <Activity size={12} />
                  {glance.activeAilments} ailment{glance.activeAilments !== 1 ? "s" : ""}
                </button>
              )}
              {glance.latestLux != null && (
                <span
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-rhozly-surface-low border border-rhozly-outline/15 text-rhozly-on-surface/70 text-xs font-black"
                  title={glance.latestLuxAreaName ? `Latest reading from ${glance.latestLuxAreaName}` : "Latest lux reading"}
                >
                  <Sun size={12} className="text-amber-500" />
                  {Math.round(glance.latestLux).toLocaleString()} lx
                </span>
              )}
              <button
                onClick={() => {
                  try {
                    const sunlight = Array.isArray(fullPlantData?.sunlight)
                      ? (fullPlantData.sunlight[0] ?? null)
                      : (typeof fullPlantData?.sunlight === "string" ? fullPlantData.sunlight : null);
                    sessionStorage.setItem(
                      "rhozly:sun-tracker-plant",
                      JSON.stringify({
                        id: String(plant.id),
                        name: plant.common_name || "Plant",
                        sunlight,
                        source: "shed",
                      }),
                    );
                  } catch { /* ignore */ }
                  navigate("/sun-trajectory?mode=garden");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-black hover:bg-orange-100 transition-colors"
                aria-label="Find a spot in the Sun Tracker"
              >
                <MapPin size={12} />
                Find a spot
              </button>
            </div>
          )}
        </div>

        {/* sr-only live region for async feedback */}
        <span ref={liveRegionRef} role="status" aria-live="polite" className="sr-only">
          {loadSuccess ? "Care guide loaded successfully." : ""}
        </span>

        {/* Tab Navigation — scroll-snap on mobile for clean horizontal scrolling */}
        <div className="flex gap-1 sm:gap-2 border-b-2 border-rhozly-outline/20 bg-rhozly-surface-low/50 shrink-0 shadow-sm overflow-x-auto px-2 sm:px-8 scrollbar-none snap-x snap-mandatory">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`plant-modal-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 snap-start flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-4 sm:py-5 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-4 ${
                activeTab === tab.id
                  ? "border-rhozly-primary text-rhozly-primary"
                  : "border-transparent text-rhozly-on-surface/30 hover:text-rhozly-on-surface"
              }`}
            >
              <tab.icon size={14} className="sm:w-4 sm:h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
          {isFetchingApiData ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50 animate-in fade-in">
              <Loader2
                className="animate-spin text-rhozly-primary mb-4"
                size={32}
              />
              <p className="font-bold text-sm">Loading encyclopedia data...</p>
            </div>
          ) : fetchError ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 animate-in fade-in">
              <p className="font-bold text-sm text-rhozly-on-surface/60">
                Could not load the live care guide.
              </p>
              <button
                onClick={fetchApiDetails}
                className="flex items-center gap-2 px-5 py-3 min-h-[44px] bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-opacity"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          ) : activeTab === "care" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {(plant.source === "api" || plant.source === "verdantly") && (
                <p className="text-[10px] text-rhozly-on-surface/40 font-semibold uppercase tracking-widest mb-4">
                  Read-only — data sourced from {getProviderLabel(plant.source) ?? "the plant encyclopedia"}
                </p>
              )}
              <ManualPlantCreation
                initialData={fullPlantData}
                onSave={onSave}
                submitLabel="Save Updates"
                isSaving={isSaving}
                isReadOnly={plant.source === "api" || plant.source === "verdantly"}
              />
            </div>
          ) : activeTab === "schedules" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <PlantScheduleTab homeId={homeId} plant={fullPlantData} />
            </div>
          ) : activeTab === "light" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <LightTab plantId={plant.id} plantName={plant.common_name} />
            </div>
          ) : activeTab === "guides" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <PlantGuidesTab
                plantId={plant.id}
                commonName={plant.common_name}
              />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <CompanionPlantsTab
                source={plant.source}
                verdantlyId={plant.verdantly_id ?? null}
                plantName={plant.common_name}
                homeId={homeId}
                aiEnabled={aiEnabled}
                isPremium={isPremium}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
