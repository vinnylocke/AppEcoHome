import React from "react";
import {
  X,
  Droplets,
  Sun,
  ShieldAlert,
  Utensils,
  Info,
  History,
  TrendingUp,
  Leaf,
  Calendar,
} from "lucide-react";
import { InventoryItem, Plant, GardenTask } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface PlantDetailsModalProps {
  item: InventoryItem;
  plant: Plant | undefined;
  tasks: GardenTask[];
  onClose: () => void;
}

export const PlantDetailsModal: React.FC<PlantDetailsModalProps> = ({
  item,
  plant,
  tasks,
  onClose,
}) => {
  if (!plant) return null;

  const itemTasks = tasks.filter((t) => t.inventoryItemId === item.id);
  const completedTasks = itemTasks.filter((t) => t.status === "Completed");

  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* HEADER / IMAGE SECTION */}
        <div className="relative h-48 sm:h-64 bg-stone-100">
          <img
            src={plant.image_url || "/placeholder-plant.png"}
            alt={plant.common_name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/40 transition-all"
          >
            <X size={20} />
          </button>

          <div className="absolute bottom-6 left-8 right-8">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-black uppercase rounded-md">
                {item.status}
              </span>
              <span className="text-white/70 text-xs font-medium italic">
                {plant.scientific_name?.[0]}
              </span>
            </div>
            <h2 className="text-3xl font-bold text-white leading-tight">
              {item.identifier
                ? `${item.identifier} (${plant.common_name})`
                : plant.common_name}
            </h2>
          </div>
        </div>

        {/* CONTENT SECTION */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* LEFT COL: CARE STATS */}
            <div className="md:col-span-2 space-y-8">
              {/* Core Care Grid */}
              <section>
                <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Droplets size={14} className="text-blue-500" /> Care
                  Requirements
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    icon={<Droplets size={18} className="text-blue-500" />}
                    label="Watering"
                    value={plant.watering}
                    color="bg-blue-50"
                  />
                  <StatCard
                    icon={<Sun size={18} className="text-amber-500" />}
                    label="Sunlight"
                    value={plant.sunlight?.join(", ")}
                    color="bg-amber-50"
                  />
                  <StatCard
                    icon={<History size={18} className="text-purple-500" />}
                    label="Cycle"
                    value={plant.cycle}
                    color="bg-purple-50"
                  />
                  <StatCard
                    icon={<TrendingUp size={18} className="text-emerald-500" />}
                    label="Care Level"
                    value={plant.care_level}
                    color="bg-emerald-50"
                  />
                </div>
              </section>

              {/* Description */}
              <section>
                <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                  <Info size={14} /> Botanical Notes
                </h3>
                <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 p-4 rounded-2xl border border-stone-100">
                  {plant.description ||
                    "No detailed description available for this species."}
                </p>
              </section>

              {/* Safety & Lifestyle Tags */}
              <section className="flex flex-wrap gap-3">
                {plant.is_toxic_pets && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-xl border border-red-100">
                    <ShieldAlert size={16} />
                    <span className="text-xs font-bold">Toxic to Pets</span>
                  </div>
                )}
                {plant.is_edible && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                    <Utensils size={16} />
                    <span className="text-xs font-bold">Edible</span>
                  </div>
                )}
              </section>
            </div>

            {/* RIGHT COL: HISTORY & LOGS */}
            <div className="space-y-6">
              <div className="p-6 bg-stone-900 rounded-[2rem] text-white">
                <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-4">
                  Instance Info
                </h3>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-stone-500 uppercase">
                      Planted On
                    </span>
                    <span className="text-sm font-bold flex items-center gap-2">
                      <Calendar size={14} className="text-emerald-400" />
                      {item.plantedAt
                        ? new Date(item.plantedAt).toLocaleDateString()
                        : "Established"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-stone-500 uppercase">
                      Tasks Completed
                    </span>
                    <span className="text-sm font-bold flex items-center gap-2">
                      <Leaf size={14} className="text-emerald-400" />
                      {completedTasks.length} total
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Log Summary */}
              <div className="p-6 bg-stone-50 rounded-[2rem] border border-stone-100">
                <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3">
                  Recent Health
                </h3>
                <div className="text-xs text-stone-500 italic">
                  No recent health logs found. Add a log from the dashboard to
                  track growth.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 bg-white border border-stone-200 text-stone-600 rounded-2xl font-bold hover:bg-stone-100 transition-all"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Helper Stat Card Component ---
const StatCard = ({ icon, label, value, color }: any) => (
  <div
    className={cn(
      "p-4 rounded-[1.5rem] flex flex-col gap-2 border border-transparent transition-all hover:border-white",
      color,
    )}
  >
    {icon}
    <div>
      <span className="block text-[10px] text-stone-400 uppercase font-black">
        {label}
      </span>
      <span className="text-xs font-bold text-stone-800 capitalize leading-tight">
        {value || "Unknown"}
      </span>
    </div>
  </div>
);
