import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom"; // 🚀 IMPORT THE PORTAL
import { X, Droplets, Calendar, Database, Loader2, RefreshCw, BookOpen } from "lucide-react";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantScheduleTab from "./PlantScheduleTab";
import PlantGuidesTab from "./PlantGuidesTab";
import { PerenualService } from "../lib/perenualService";
import toast from "react-hot-toast";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface PlantEditModalProps {
  homeId: string;
  plant: any;
  onSave: (updatedData: any) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export default function PlantEditModal({
  homeId,
  plant,
  onSave,
  onClose,
  isSaving,
}: PlantEditModalProps) {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const [activeTab, setActiveTab] = useState("care");
  const [fullPlantData, setFullPlantData] = useState<any>(plant);
  const [isFetchingApiData, setIsFetchingApiData] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [loadSuccess, setLoadSuccess] = useState(false);
  const liveRegionRef = useRef<HTMLSpanElement>(null);

  const tabs = [
    { id: "care", label: "Care Guide", icon: Droplets },
    { id: "schedules", label: "Automations", icon: Calendar },
    { id: "guides", label: "Guides", icon: BookOpen },
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
      isEditingRestricted: plant.source === "api",
    });

    // Cleanup on close
    return () => setPageContext(null);
  }, [fullPlantData, activeTab, plant.source, setPageContext]);

  const fetchApiDetails = async () => {
    if (plant.source === "api" && plant.perenual_id) {
      setIsFetchingApiData(true);
      setFetchError(false);
      setLoadSuccess(false);
      try {
        const apiData = await PerenualService.getPlantDetails(
          plant.perenual_id,
        );

        // Perenual images are Wasabi signed URLs that expire after 24h.
        // If the stored URL is missing or a Wasabi URL, fetch a fresh one directly.
        const isStale = (url?: string) =>
          !url || url.includes("wasabisys.com") || url.includes("X-Amz-");

        let imageUrl = plant.thumbnail_url;
        if (isStale(imageUrl)) {
          try {
            const key = import.meta.env.VITE_PERENUAL_API_KEY;
            const res = await fetch(
              `https://perenual.com/api/v2/species/details/${plant.perenual_id}?key=${key}`,
            );
            const fresh = await res.json();
            imageUrl =
              fresh.default_image?.regular_url ||
              fresh.default_image?.thumbnail ||
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
        <div className="p-8 pb-4 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-3xl font-black text-rhozly-on-surface">
              {plant.common_name}
            </h3>
            <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest mt-1">
              Care &amp; Management
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-3 bg-rhozly-surface-low rounded-2xl hover:bg-rhozly-surface hover:scale-110 transition-all"
          >
            <X size={24} />
          </button>
        </div>

        {/* sr-only live region for async feedback */}
        <span ref={liveRegionRef} role="status" aria-live="polite" className="sr-only">
          {loadSuccess ? "Care guide loaded successfully." : ""}
        </span>

        {/* Tab Navigation */}
        <div className="px-8 flex gap-2 border-b-2 border-rhozly-outline/20 bg-rhozly-surface-low/50 shrink-0 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`plant-modal-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-5 text-xs font-black uppercase tracking-widest transition-all border-b-4 ${
                activeTab === tab.id
                  ? "border-rhozly-primary text-rhozly-primary"
                  : "border-transparent text-rhozly-on-surface/30 hover:text-rhozly-on-surface"
              }`}
            >
              <tab.icon size={16} />
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
              {plant.source === "api" && (
                <p className="text-[10px] text-rhozly-on-surface/40 font-semibold uppercase tracking-widest mb-4">
                  Read-only — data sourced from the Perenual plant encyclopedia
                </p>
              )}
              <ManualPlantCreation
                initialData={fullPlantData}
                onSave={onSave}
                submitLabel="Save Updates"
                isSaving={isSaving}
                isReadOnly={plant.source === "api"}
              />
            </div>
          ) : activeTab === "schedules" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <PlantScheduleTab homeId={homeId} plant={fullPlantData} />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <PlantGuidesTab
                plantId={plant.id}
                commonName={plant.common_name}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
