import React, { useState, useEffect } from "react";
import { X, Droplets, Calendar, Database, Loader2 } from "lucide-react";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantScheduleTab from "./PlantScheduleTab";
import { PerenualService } from "../lib/perenualService";
import toast from "react-hot-toast";

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
  const [activeTab, setActiveTab] = useState("care");

  // 🚀 NEW: State to hold the dynamic API data
  const [fullPlantData, setFullPlantData] = useState<any>(plant);
  const [isFetchingApiData, setIsFetchingApiData] = useState(false);

  const tabs = [
    { id: "care", label: "Care Guide", icon: Droplets },
    { id: "schedules", label: "Automations", icon: Calendar },
  ];

  // 🚀 REPLACEMENT useEffect FOR PlantEditModal.tsx
  useEffect(() => {
    const fetchApiDetails = async () => {
      if (plant.source === "api" && plant.perenual_id) {
        setIsFetchingApiData(true);
        try {
          const apiData = await PerenualService.getPlantDetails(
            plant.perenual_id,
          );
          // Merge the DB skeleton with the rich API data
          setFullPlantData({ ...plant, ...apiData });
        } catch (error) {
          toast.error("Failed to load live care guide.");
        } finally {
          setIsFetchingApiData(false);
        }
      } else {
        // 🚀 THE FIX: If it's a manual plant, instantly sync the fresh data!
        setFullPlantData(plant);
      }
    };

    fetchApiDetails();
  }, [plant]); // <--- Because 'plant' is in this array, it runs every time you hit Save!

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest w-full max-w-3xl h-[90vh] flex flex-col rounded-[3rem] shadow-2xl border border-rhozly-outline/20 overflow-hidden">
        {/* Header */}
        <div className="p-8 pb-4 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-3xl font-black text-rhozly-on-surface">
              {plant.common_name}
            </h3>
            <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest mt-1">
              Plant Management
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-8 flex gap-2 border-b border-rhozly-outline/10 bg-rhozly-surface-low/30 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
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
          ) : activeTab === "care" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <ManualPlantCreation
                initialData={fullPlantData} // 🚀 Passes the dynamically fetched data!
                onSave={onSave}
                submitLabel="Save Updates"
                isSaving={isSaving}
                isReadOnly={plant.source === "api"}
              />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <PlantScheduleTab homeId={homeId} plant={fullPlantData} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
