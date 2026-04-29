import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Check, Sparkles, Database, Loader2 } from "lucide-react";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import toast from "react-hot-toast";

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
  const location = useLocation();
  const { setIsOpen } = usePlantDoctor();

  const plantList = plants || (plant ? [plant] : []);

  const [selectedRecs, setSelectedRecs] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const toggleSelection = (query: string) => {
    setSelectedRecs((prev) =>
      prev.includes(query) ? prev.filter((q) => q !== query) : [...prev, query],
    );
  };

  const handleBulkImport = async (source: "ai" | "api") => {
    setIsImporting(true);
    try {
      setIsOpen(false);
      toast.success(
        source === "ai"
          ? "Generating with AI…"
          : "Looking up in Plant Database…",
      );
      navigate("/shed", { state: { autoImport: selectedRecs, source, returnTo: location.pathname + location.search } });
    } catch (err) {
      console.error("Import failed:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  if (plantList.length === 0) return null;

  return (
    <div className="mt-3 p-4 bg-white/80 backdrop-blur-md rounded-2xl border border-rhozly-outline shadow-sm max-w-sm mx-auto w-full">
      <p className="text-xs text-rhozly-primary font-bold uppercase tracking-widest mb-3">
        Add to your Shed
      </p>

      <div className="space-y-2 mb-4">
        {plantList.map((p, idx) => {
          const isSelected = selectedRecs.includes(p.search_query);
          return (
            <label
              key={idx}
              className={`flex items-center gap-3 min-h-[44px] px-3 rounded-2xl border text-sm cursor-pointer transition-colors ${
                isSelected
                  ? "border-rhozly-primary bg-rhozly-surface-low text-rhozly-on-surface"
                  : "border-rhozly-outline bg-white text-rhozly-on-surface hover:border-rhozly-primary-container"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                onChange={() => toggleSelection(p.search_query)}
              />
              <div
                className={`w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                  isSelected
                    ? "bg-rhozly-primary border-rhozly-primary text-white"
                    : "border-rhozly-outline bg-white"
                }`}
              >
                {isSelected && <Check size={14} strokeWidth={4} />}
              </div>
              <span className="font-bold leading-tight">{p.name}</span>
            </label>
          );
        })}
      </div>

      {selectedRecs.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-rhozly-outline">
          <button
            onClick={() => handleBulkImport("ai")}
            disabled={isImporting}
            className="w-full py-3 bg-rhozly-primary hover:bg-rhozly-primary-container disabled:opacity-60 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            {isImporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}{" "}
            Generate with AI ({selectedRecs.length})
          </button>
          <button
            onClick={() => handleBulkImport("api")}
            disabled={isImporting}
            className="w-full py-3 bg-white border-2 border-rhozly-primary text-rhozly-primary hover:bg-rhozly-surface-low disabled:opacity-60 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            {isImporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Database size={16} />
            )}{" "}
            Match via Plant Database ({selectedRecs.length})
          </button>
        </div>
      )}
    </div>
  );
};
