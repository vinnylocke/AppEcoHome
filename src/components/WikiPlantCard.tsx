import React, { useState, useEffect, useMemo } from "react";
import { Loader2, Leaf, Trash2, Sparkles } from "lucide-react";
import { getPlantWikiInfo } from "../lib/wikipedia";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";

interface WikiPlantCardProps {
  plant: any;
  idx: number;
  isStarted: boolean;
  isPhase2Done: boolean;
  plantMapping: Record<number, string>;
  setPlantMapping: (mapping: Record<number, string>) => void;
  selectedForProcurement: number[];
  setSelectedForProcurement: (val: number[]) => void;
  handleDeletePlant: (idx: number) => void;
  shedPlants: any[];
}

export default function WikiPlantCard({
  plant,
  idx,
  isStarted,
  isPhase2Done,
  plantMapping,
  setPlantMapping,
  selectedForProcurement,
  setSelectedForProcurement,
  handleDeletePlant,
  shedPlants,
}: WikiPlantCardProps) {
  const { preferences } = usePlantDoctor();

  const [wikiData, setWikiData] = useState<{
    thumbnail: string | null;
    extract: string | null;
  }>({ thumbnail: null, extract: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Sort shed plants so the closest name-match to this plan plant comes first.
  const rankedShedPlants = useMemo(() => {
    if (!shedPlants.length) return shedPlants;
    return [...shedPlants].sort((a, b) => {
      const scoreA = scorePlantByPreferences(plant.common_name, "", [
        { home_id: "", entity_type: "plant", entity_name: a.common_name, sentiment: "positive" },
      ]);
      const scoreB = scorePlantByPreferences(plant.common_name, "", [
        { home_id: "", entity_type: "plant", entity_name: b.common_name, sentiment: "positive" },
      ]);
      return scoreB - scoreA;
    });
  }, [shedPlants, plant.common_name]);

  const plantPrefScore = useMemo(
    () => scorePlantByPreferences(plant.common_name, plant.scientific_name || "", preferences),
    [plant.common_name, plant.scientific_name, preferences],
  );

  const topShedMatch = rankedShedPlants[0];
  const topMatchScore = topShedMatch
    ? scorePlantByPreferences(plant.common_name, "", [
        { home_id: "", entity_type: "plant", entity_name: topShedMatch.common_name, sentiment: "positive" },
      ])
    : 0;

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const fetchInfo = async () => {
      try {
        const data = await getPlantWikiInfo(plant.common_name);
        if (isMounted && data) {
          setWikiData(data);
        }
      } catch (error) {
        console.error("Error loading wiki data:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInfo();

    return () => {
      isMounted = false;
    };
  }, [plant.common_name]);

  const isCreate = plantMapping[idx] === "create" || !plantMapping[idx];

  return (
    <div className="p-5 border border-emerald-100 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 animate-in fade-in">
      {/* 1. TOP BAR: Title & Controls */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-3">
          {isCreate && (
            <input
              type="checkbox"
              checked={selectedForProcurement.includes(idx)}
              onChange={(e) =>
                e.target.checked
                  ? setSelectedForProcurement([...selectedForProcurement, idx])
                  : setSelectedForProcurement(
                      selectedForProcurement.filter((i: any) => i !== idx),
                    )
              }
              className={`w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer`}
            />
          )}
          <div>
            <h3 className="font-black text-gray-900 text-lg leading-tight">
              {plant.common_name}{" "}
              <span className="text-emerald-600">(x{plant.quantity})</span>
            </h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              {plant.scientific_name}
            </p>
            {plantPrefScore > 0 && (
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <Sparkles size={9} /> Preferred plant
              </span>
            )}
          </div>
        </div>

        {isStarted && !isPhase2Done && (
          <button
            onClick={() => handleDeletePlant(idx)}
            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-colors shrink-0"
            title="Remove this plant"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* 2. MIDDLE CONTENT: Image & Info */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-32 h-40 sm:h-32 shrink-0 rounded-xl overflow-hidden bg-emerald-50/50 border border-emerald-100 flex items-center justify-center relative">
          {isLoading ? (
            <Loader2 className="animate-spin text-emerald-300" size={24} />
          ) : wikiData.thumbnail ? (
            <img
              src={wikiData.thumbnail}
              alt={plant.common_name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <Leaf className="text-emerald-200" size={32} />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {wikiData.extract && (
            <div>
              <p
                className={`text-sm text-gray-600 italic leading-relaxed border-l-2 border-emerald-200 pl-3 ${isExpanded ? "" : "line-clamp-3"}`}
              >
                "{wikiData.extract}"
              </p>
              {wikiData.extract.length > 150 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-[11px] font-black text-emerald-600 hover:text-emerald-800 mt-1.5 ml-3 uppercase tracking-wider"
                >
                  {isExpanded ? "Read Less" : "Read More"}
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {plant.aesthetic_reason && (
              <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100/50">
                <span className="font-black text-[10px] uppercase tracking-wider text-emerald-800 block mb-1">
                  Aesthetic Fit
                </span>
                <p className="text-xs text-gray-700 leading-snug">
                  {plant.aesthetic_reason}
                </p>
              </div>
            )}
            {plant.horticultural_reason && (
              <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100/50">
                <span className="font-black text-[10px] uppercase tracking-wider text-emerald-800 block mb-1">
                  Environment Fit
                </span>
                <p className="text-xs text-gray-700 leading-snug">
                  {plant.horticultural_reason}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. BOTTOM BAR: Sourcing Controls */}
      <div
        className={`pt-3 mt-1 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${!isStarted ? "opacity-30 grayscale pointer-events-none select-none" : ""}`}
      >
        <p className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-2 rounded-lg inline-flex items-center gap-2">
          <Sparkles size={14} className="text-emerald-500 shrink-0" />{" "}
          {plant.procurement_advice}
        </p>

        <select
          value={plantMapping[idx] || "create"}
          onChange={(e) => {
            const val = e.target.value;
            setPlantMapping({ ...plantMapping, [idx]: val });
            if (val !== "create")
              setSelectedForProcurement(
                selectedForProcurement.filter((i: any) => i !== idx),
              );
          }}
          className="w-full sm:w-auto p-2.5 bg-white rounded-xl border border-emerald-200 text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="create">⚠️ Needs Procurement</option>
          {rankedShedPlants.length > 0 && (
            <optgroup label="Link to Shed">
              {rankedShedPlants.map((sp: any) => (
                <option key={sp.id} value={sp.id}>
                  {sp === topShedMatch && topMatchScore > 0 ? "⭐ Best match: " : "Link: "}
                  {sp.common_name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    </div>
  );
}
