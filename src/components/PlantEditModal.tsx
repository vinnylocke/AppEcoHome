import React, { useState } from "react";
import { X, Droplets, Calendar, XCircle } from "lucide-react";
import ManualPlantCreation from "./ManualPlantCreation";

interface PlantEditModalProps {
  plant: any;
  onSave: (updatedData: any) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export default function PlantEditModal({
  plant,
  onSave,
  onClose,
  isSaving,
}: PlantEditModalProps) {
  const [activeTab, setActiveTab] = useState("care");

  const tabs = [
    { id: "care", label: "Care Guide", icon: Droplets },
    { id: "schedules", label: "Schedules", icon: Calendar }, // Placeholders for later
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest w-full max-w-2xl h-[90vh] flex flex-col rounded-[3rem] shadow-2xl border border-rhozly-outline/20 overflow-hidden">
        {/* Header */}
        <div className="p-8 pb-4 flex justify-between items-start">
          <div>
            <h3 className="text-3xl font-black text-rhozly-on-surface">
              {plant.common_name}
            </h3>
            <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest mt-1">
              Refining Care Details
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
        <div className="px-8 flex gap-2 border-b border-rhozly-outline/10 bg-rhozly-surface-low/30">
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
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === "care" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {/* 🚀 REUSING the Manual Creation Form here */}
              <ManualPlantCreation
                initialData={plant}
                onSave={onSave}
                submitLabel="Save Updates"
                isSaving={isSaving}
              />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40 py-20">
              <Calendar size={48} />
              <div>
                <p className="font-black uppercase tracking-widest text-sm">
                  Schedules Coming Soon
                </p>
                <p className="text-xs font-bold">
                  Automated reminders and tasks are in development.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
