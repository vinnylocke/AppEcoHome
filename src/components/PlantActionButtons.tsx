import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { Check, Sparkles, Database } from "lucide-react";
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface PlantActionProps {
  plant?: { name: string; search_query: string };
  plants?: { name: string; search_query: string }[];
  homeId: string;
}

export const PlantActionButtons = ({
  plant,
  plants,
  homeId,
}: PlantActionProps) => {
  const navigate = useNavigate();
  const { setIsOpen } = usePlantDoctor();

  const plantList = plants || (plant ? [plant] : []);

  // 🚀 FIX: Start completely unchecked
  const [selectedRecs, setSelectedRecs] = useState<string[]>([]);

  const toggleSelection = (query: string) => {
    setSelectedRecs((prev) =>
      prev.includes(query) ? prev.filter((q) => q !== query) : [...prev, query],
    );
  };

  const handleBulkImport = (source: "ai" | "api") => {
    setIsOpen(false);
    navigate("/shed", { state: { autoImport: selectedRecs, source } });
  };

  if (plantList.length === 0) return null;

  return (
    <div className="mt-3 p-4 bg-white/80 backdrop-blur-md rounded-2xl border border-green-100 shadow-sm">
      <p className="text-xs text-green-800 font-bold uppercase tracking-widest mb-3">
        Add to your Shed
      </p>

      <div className="space-y-2 mb-4">
        {plantList.map((p, idx) => {
          const isSelected = selectedRecs.includes(p.search_query);
          return (
            <div
              key={idx}
              onClick={() => toggleSelection(p.search_query)}
              className={`p-3 rounded-xl border text-sm flex items-center gap-3 cursor-pointer transition-colors ${
                isSelected
                  ? "border-green-500 bg-green-50 text-green-900"
                  : "border-gray-200 bg-white text-gray-600 hover:border-green-300"
              }`}
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                  isSelected
                    ? "bg-green-500 border-green-500 text-white"
                    : "border-gray-300 bg-white"
                }`}
              >
                {isSelected && <Check size={14} strokeWidth={4} />}
              </div>
              <span className="font-bold leading-tight">{p.name}</span>
            </div>
          );
        })}
      </div>

      {selectedRecs.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-green-100">
          <button
            onClick={() => handleBulkImport("ai")}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            <Sparkles size={16} /> Generate with AI ({selectedRecs.length})
          </button>
          <button
            onClick={() => handleBulkImport("api")}
            className="w-full py-3 bg-white border-2 border-green-600 text-green-600 hover:bg-green-50 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            <Database size={16} /> Match via Perenual ({selectedRecs.length})
          </button>
        </div>
      )}
    </div>
  );
};
